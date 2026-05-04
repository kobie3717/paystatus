import { getPool } from '../db';
import { VENDOR_STATUS_HOSTS } from '../layers';

interface StatusPageResponse {
  status: {
    indicator: 'none' | 'minor' | 'major' | 'critical';
    description: string;
  };
  page?: {
    id?: string;
    name?: string;
  };
}

const disabledHosts = new Set<string>();

function mapIndicatorToStatus(indicator: string): 'up' | 'degraded' | 'down' {
  switch (indicator) {
    case 'none':
      return 'up';
    case 'minor':
      return 'degraded';
    case 'major':
    case 'critical':
      return 'down';
    default:
      return 'down';
  }
}

export async function runVendorStatusCheck(provider: string, statusHost: string): Promise<void> {
  if (disabledHosts.has(statusHost)) {
    return;
  }

  const url = `${statusHost}/api/v2/status.json`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': 'paystatus/0.2.0 (https://status.whatshubb.co.za)',
      },
    });

    const latency = Date.now() - start;

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  ${provider}: vendor status page not found (404), disabling`);
        disabledHosts.add(statusHost);
        await writeCheck(provider, 'unknown', latency, null, 'Status page not available', 'low');
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      console.log(`  ${provider}: vendor status page is not JSON (got ${contentType}), disabling`);
      disabledHosts.add(statusHost);
      await writeCheck(provider, 'unknown', latency, null, 'Status page does not expose Statuspage.io JSON API', 'low');
      return;
    }

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch {
      console.log(`  ${provider}: vendor status page JSON parse failed, disabling`);
      disabledHosts.add(statusHost);
      await writeCheck(provider, 'unknown', latency, null, 'Status page returned invalid JSON', 'low');
      return;
    }

    if (!rawData || typeof rawData !== 'object' || !('status' in rawData) || !rawData.status || typeof rawData.status !== 'object' || !('indicator' in rawData.status)) {
      console.log(`  ${provider}: vendor status page schema mismatch, disabling`);
      disabledHosts.add(statusHost);
      await writeCheck(provider, 'unknown', latency, null, 'Status page does not match Statuspage.io schema', 'low');
      return;
    }

    const data = rawData as StatusPageResponse;
    const status = mapIndicatorToStatus(data.status.indicator);
    const confidence = 'medium';

    await writeCheck(
      provider,
      status,
      latency,
      data.status.indicator,
      data.status.description,
      confidence
    );
  } catch (err: any) {
    const latency = Date.now() - start;
    const errorMessage = err.name === 'AbortError' ? 'Timeout' : err.message;

    if (err.code === 'ENOTFOUND' || err.cause?.code === 'ENOTFOUND') {
      console.log(`  ${provider}: vendor status host DNS failed, disabling`);
      disabledHosts.add(statusHost);
      await writeCheck(provider, 'unknown', latency, null, 'DNS resolution failed', 'low');
      return;
    }

    await writeCheck(provider, 'down', latency, null, errorMessage, 'low');
  }
}

async function writeCheck(
  provider: string,
  status: string,
  latencyMs: number,
  vendorIndicator: string | null,
  vendorDescription: string,
  confidence: 'low' | 'medium' | 'high'
): Promise<void> {
  const sanitized = vendorDescription
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 500);

  await getPool().query(
    `INSERT INTO status_checks
      (provider, layer, status, latency_ms, vendor_indicator, vendor_description, confidence)
     VALUES ($1, 'vendor_status', $2, $3, $4, $5, $6)`,
    [provider, status, latencyMs, vendorIndicator, sanitized, confidence]
  );
  console.log(`  ${provider} [vendor]: ${status} (${latencyMs}ms) [${confidence}]`);
}

export async function runVendorStatusLoop(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting vendor status tick...`);

  for (const { provider, statusHost } of VENDOR_STATUS_HOSTS) {
    if (!statusHost) continue;
    await runVendorStatusCheck(provider, statusHost);
  }

  console.log(`[${new Date().toISOString()}] Vendor status tick complete`);
}
