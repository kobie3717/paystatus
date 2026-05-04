import { getPool } from '../db';
import { HTTP_PROBE_ENDPOINTS } from '../layers';

async function attemptProbe(
  url: string,
  expectedStatuses: number[]
): Promise<{ success: boolean; latency: number; statusCode?: number; error?: string }> {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'paystatus/0.2.0 (https://status.whatshubb.co.za)',
      },
    });

    const latency = Date.now() - start;
    const statusCode = response.status;

    const isAlive =
      expectedStatuses.includes(statusCode) ||
      (statusCode >= 400 && statusCode < 500);

    return {
      success: isAlive,
      latency,
      statusCode,
    };
  } catch (err: any) {
    const latency = Date.now() - start;
    const errorMessage = err.name === 'AbortError' ? 'Timeout' : err.message;

    return {
      success: false,
      latency,
      error: errorMessage,
    };
  }
}

export async function runHTTPProbe(
  provider: string,
  url: string,
  expectedStatuses: number[]
): Promise<void> {
  const firstAttempt = await attemptProbe(url, expectedStatuses);

  if (firstAttempt.success) {
    const status = firstAttempt.latency > 2000 ? 'degraded' : 'up';
    await writeCheck(
      provider,
      status,
      firstAttempt.latency,
      firstAttempt.statusCode,
      null,
      'medium'
    );
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  const retryAttempt = await attemptProbe(url, expectedStatuses);

  if (retryAttempt.success) {
    await writeCheck(
      provider,
      'degraded',
      retryAttempt.latency,
      retryAttempt.statusCode,
      'Recovered on retry',
      'medium'
    );
  } else {
    const errorMessage = retryAttempt.error || `HTTP ${retryAttempt.statusCode || 'error'}`;
    await writeCheck(
      provider,
      'down',
      retryAttempt.latency,
      retryAttempt.statusCode,
      errorMessage,
      'high'
    );
  }
}

async function writeCheck(
  provider: string,
  status: string,
  latencyMs: number,
  httpStatusCode: number | undefined,
  errorMessage: string | null,
  confidence: 'low' | 'medium' | 'high'
): Promise<void> {
  await getPool().query(
    `INSERT INTO status_checks
      (provider, layer, status, latency_ms, http_status_code, error_message, confidence)
     VALUES ($1, 'http_probe', $2, $3, $4, $5, $6)`,
    [provider, status, latencyMs, httpStatusCode ?? null, errorMessage, confidence]
  );
  console.log(
    `  ${provider} [http]: ${status} (${latencyMs}ms, HTTP ${httpStatusCode || 'N/A'}) [${confidence}]`
  );
}

export async function runHTTPProbeLoop(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting HTTP probe tick...`);

  for (const { provider, url, expectedStatuses } of HTTP_PROBE_ENDPOINTS) {
    await runHTTPProbe(provider, url, expectedStatuses);
  }

  console.log(`[${new Date().toISOString()}] HTTP probe tick complete`);
}
