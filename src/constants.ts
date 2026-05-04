export const OFFICIAL_STATUS_URLS: Record<string, string> = {
  stripe: 'https://www.stripestatus.com',
  paystack: 'https://paystack.statuspage.io',
  payfast: 'https://www.payfast.io',
  flutterwave: 'https://status.flutterwave.com',
  mollie: 'https://status.mollie.com',
  razorpay: 'https://status.razorpay.com',
  square: 'https://www.issquareup.com',
  mercadopago: 'https://status.mercadopago.com',
  pesapal: 'https://www.pesapal.com',
};

export const DISPLAY_LABELS: Record<string, string> = {
  up: 'Sandbox reachable',
  degraded: 'Slow / 1 retry',
  observed_failure: 'Single failure observed',
  down: 'Sandbox unreachable (≥2 attempts)',
  drift: 'Schema drift observed',
  skipped: 'Not configured',
};

export const SEVERITY_DISPLAY_LABELS: Record<string, string> = {
  outage: 'Observed sandbox unreachability (≥2 consecutive failures)',
  degraded: 'Observed degraded performance',
  drift: 'Observed schema drift',
  observation: 'Single failure observation',
};
