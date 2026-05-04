import { PayBridge, captureShape, diffBaseline, FileDriftStore } from 'paybridge';
import type { ResponseShape, ProviderBaseline } from 'paybridge';
import { config } from './config';
import { getPool } from './db';

interface ProviderProbe {
  name: string;
  enabled: boolean;
  build: () => PayBridge;
  paymentArgs: () => any;
}

interface ProviderState {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastObservedStatus: 'up' | 'degraded' | 'down' | 'drift' | 'observed_failure' | 'unknown';
}

const providerState = new Map<string, ProviderState>();

function getProviderState(provider: string): ProviderState {
  if (!providerState.has(provider)) {
    providerState.set(provider, {
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastObservedStatus: 'unknown',
    });
  }
  return providerState.get(provider)!;
}

function computeConfidence(state: ProviderState): 'low' | 'medium' | 'high' {
  const streakLength = Math.max(state.consecutiveSuccesses, state.consecutiveFailures);
  if (streakLength === 1) return 'low';
  if (streakLength === 2) return 'medium';
  return 'high';
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DRIFT_BASELINE_DIR = '/var/lib/paystatus/drift';
const driftStore = new FileDriftStore(DRIFT_BASELINE_DIR);

const commonParams = {
  customer: {
    name: 'PayStatus Probe',
    email: 'probe@paystatus.dev',
  },
  urls: {
    success: 'https://status.whatshubb.co.za/probe',
    cancel: 'https://status.whatshubb.co.za/probe',
    webhook: 'https://status.whatshubb.co.za/probe',
  },
};

const probes: ProviderProbe[] = [
  {
    name: 'stripe',
    enabled: !!config.stripe.apiKey,
    build: () =>
      new PayBridge({
        provider: 'stripe',
        credentials: { apiKey: config.stripe.apiKey! },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 10,
      currency: 'ZAR',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'paystack',
    enabled: !!config.paystack.apiKey,
    build: () =>
      new PayBridge({
        provider: 'paystack',
        credentials: { apiKey: config.paystack.apiKey! },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 100,
      currency: config.paystack.currency,
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'payfast',
    enabled: !!config.payfast.merchantId && !!config.payfast.merchantKey,
    build: () =>
      new PayBridge({
        provider: 'payfast',
        credentials: {
          merchantId: config.payfast.merchantId!,
          merchantKey: config.payfast.merchantKey!,
          passphrase: config.payfast.passphrase,
        },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 10,
      currency: 'ZAR',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'flutterwave',
    enabled: !!config.flutterwave.apiKey,
    build: () =>
      new PayBridge({
        provider: 'flutterwave',
        credentials: { apiKey: config.flutterwave.apiKey! },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 10,
      currency: 'ZAR',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'mollie',
    enabled: !!config.mollie.apiKey,
    build: () =>
      new PayBridge({
        provider: 'mollie',
        credentials: { apiKey: config.mollie.apiKey! },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 10,
      currency: 'EUR',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'razorpay',
    enabled: !!config.razorpay.keyId && !!config.razorpay.keySecret,
    build: () =>
      new PayBridge({
        provider: 'razorpay',
        credentials: {
          keyId: config.razorpay.keyId!,
          keySecret: config.razorpay.keySecret!,
        },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 100,
      currency: 'INR',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'square',
    enabled: !!config.square.accessToken,
    build: () =>
      new PayBridge({
        provider: 'square',
        credentials: {
          accessToken: config.square.accessToken!,
          locationId: config.square.locationId,
        },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 10,
      currency: 'USD',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'mercadopago',
    enabled: !!config.mercadopago.accessToken,
    build: () =>
      new PayBridge({
        provider: 'mercadopago',
        credentials: { accessToken: config.mercadopago.accessToken! },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 10,
      currency: 'ARS',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
  {
    name: 'pesapal',
    enabled: !!config.pesapal.consumerKey && !!config.pesapal.consumerSecret,
    build: () =>
      new PayBridge({
        provider: 'pesapal',
        credentials: {
          consumerKey: config.pesapal.consumerKey!,
          consumerSecret: config.pesapal.consumerSecret!,
        },
        sandbox: true,
      }),
    paymentArgs: () => ({
      amount: 100,
      currency: 'KES',
      reference: `probe-${Date.now()}`,
      ...commonParams,
    }),
  },
];

export async function runProbe(probe: ProviderProbe): Promise<void> {
  if (!probe.enabled) {
    await writeCheck(probe.name, 'skipped', undefined, undefined, undefined, false, null, 'high');
    return;
  }

  const state = getProviderState(probe.name);
  let firstAttemptSuccess = false;
  let retryAttemptSuccess = false;
  let latency = 0;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let driftDetected = false;
  let driftSummary: string | null = null;

  const attemptProbe = async (): Promise<{ success: boolean; latency: number; result?: any; error?: any }> => {
    const start = Date.now();
    try {
      const pay = probe.build();
      const result = await pay.createPayment(probe.paymentArgs());
      const elapsed = Date.now() - start;
      return { success: true, latency: elapsed, result };
    } catch (err: any) {
      const elapsed = Date.now() - start;
      return { success: false, latency: elapsed, error: err };
    }
  };

  const firstAttempt = await attemptProbe();
  latency = firstAttempt.latency;

  if (firstAttempt.success) {
    firstAttemptSuccess = true;

    const responseObj = (firstAttempt.result as any).raw ?? firstAttempt.result;
    const currentShape: ResponseShape = captureShape(responseObj);
    const baseline = await driftStore.load(probe.name);

    if (!baseline) {
      const newBaseline: ProviderBaseline = {
        providerName: probe.name,
        operation: 'createPayment',
        shape: currentShape,
        libVersion: '0.12.0',
      };
      await driftStore.save(newBaseline);
    } else {
      const report = diffBaseline(baseline, currentShape, probe.name);
      if (report.driftDetected) {
        driftDetected = true;
        driftSummary = JSON.stringify({
          added: report.addedKeys,
          removed: report.removedKeys,
          typeChanged: report.typeChanges,
        });
      }
    }
  } else {
    await sleep(5000);
    const retryAttempt = await attemptProbe();
    latency = retryAttempt.latency;

    if (retryAttempt.success) {
      retryAttemptSuccess = true;

      const responseObj = (retryAttempt.result as any).raw ?? retryAttempt.result;
      const currentShape: ResponseShape = captureShape(responseObj);
      const baseline = await driftStore.load(probe.name);

      if (!baseline) {
        const newBaseline: ProviderBaseline = {
          providerName: probe.name,
          operation: 'createPayment',
          shape: currentShape,
          libVersion: '0.12.0',
        };
        await driftStore.save(newBaseline);
      } else {
        const report = diffBaseline(baseline, currentShape, probe.name);
        if (report.driftDetected) {
          driftDetected = true;
          driftSummary = JSON.stringify({
            added: report.addedKeys,
            removed: report.removedKeys,
            typeChanged: report.typeChanges,
          });
        }
      }
    } else {
      const err = retryAttempt.error;
      errorCode = err?.constructor?.name ?? 'Error';
      errorMessage = err?.message?.slice(0, 500) ?? 'unknown';
    }
  }

  let finalStatus: 'up' | 'degraded' | 'down' | 'drift' | 'observed_failure';
  let severity: 'outage' | 'degraded' | 'drift' | 'observation' | null = null;
  let summary = '';

  if (firstAttemptSuccess) {
    finalStatus = driftDetected ? 'drift' : latency > 2000 ? 'degraded' : 'up';
    state.consecutiveSuccesses++;
    state.consecutiveFailures = 0;
    state.lastObservedStatus = finalStatus;

    await maybeCloseIncident(probe.name);
    if (finalStatus === 'drift') {
      severity = 'drift';
      summary = driftSummary ?? 'schema drift detected';
      await maybeOpenIncident(probe.name, severity, summary);
    } else if (finalStatus === 'degraded') {
      severity = 'degraded';
      summary = `latency ${latency}ms`;
      await maybeOpenIncident(probe.name, severity, summary);
    }
  } else if (retryAttemptSuccess) {
    finalStatus = driftDetected ? 'drift' : 'degraded';
    state.consecutiveSuccesses++;
    state.consecutiveFailures = 0;
    state.lastObservedStatus = finalStatus;

    await maybeCloseIncident(probe.name);
    severity = finalStatus === 'drift' ? 'drift' : 'degraded';
    summary = finalStatus === 'drift' ? (driftSummary ?? 'schema drift detected') : `transient failure, retry succeeded after ${latency}ms`;
    await maybeOpenIncident(probe.name, severity, summary);
  } else {
    state.consecutiveFailures++;
    state.consecutiveSuccesses = 0;

    if (state.consecutiveFailures < 2) {
      finalStatus = 'observed_failure';
      state.lastObservedStatus = finalStatus;
      summary = errorMessage ?? 'unknown error';
    } else {
      finalStatus = 'down';
      state.lastObservedStatus = finalStatus;
      severity = 'outage';
      summary = errorMessage ?? 'unknown error';
      await maybeOpenIncident(probe.name, severity, summary);
    }
  }

  const confidence = computeConfidence(state);
  await writeCheck(probe.name, finalStatus, latency, errorCode, errorMessage, driftDetected, driftSummary, confidence);
}

export function startMonitorLoop(intervalMs: number = 60_000): NodeJS.Timeout {
  const tick = async () => {
    console.log(`[${new Date().toISOString()}] Starting probe tick...`);
    for (const probe of probes) {
      await runProbe(probe);
    }
    console.log(`[${new Date().toISOString()}] Probe tick complete`);
  };

  tick(); // run once immediately
  const handle = setInterval(tick, intervalMs);
  if (handle.unref) handle.unref();
  return handle;
}

async function writeCheck(
  provider: string,
  status: string,
  latencyMs?: number,
  errorCode?: string,
  errorMessage?: string,
  driftDetected = false,
  driftSummary?: string | null,
  confidence: 'low' | 'medium' | 'high' = 'low'
): Promise<void> {
  await getPool().query(
    'INSERT INTO status_checks (provider, status, latency_ms, error_code, error_message, drift_detected, drift_summary, confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [provider, status, latencyMs ?? null, errorCode ?? null, errorMessage ?? null, driftDetected, driftSummary ?? null, confidence]
  );
  console.log(`  ${provider}: ${status}${latencyMs ? ` (${latencyMs}ms)` : ''} [${confidence}]`);
}

async function maybeOpenIncident(provider: string, severity: string, summary: string): Promise<void> {
  const { rows } = await getPool().query(
    'SELECT id FROM incidents WHERE provider = $1 AND severity = $2 AND resolved_at IS NULL LIMIT 1',
    [provider, severity]
  );
  if (rows.length === 0) {
    await getPool().query(
      'INSERT INTO incidents (provider, started_at, severity, summary) VALUES ($1, now(), $2, $3)',
      [provider, severity, summary.slice(0, 500)]
    );
    console.log(`  → Opened ${severity} incident for ${provider}`);
  }
}

async function maybeCloseIncident(provider: string): Promise<void> {
  const { rowCount } = await getPool().query(
    'UPDATE incidents SET resolved_at = now() WHERE provider = $1 AND resolved_at IS NULL',
    [provider]
  );
  if (rowCount && rowCount > 0) {
    console.log(`  → Resolved incidents for ${provider}`);
  }
}
