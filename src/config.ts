export const config = {
  port: Number(process.env.PORT ?? 4032),
  databaseUrl: process.env.DATABASE_URL!,
  intervalMs: Number(process.env.PROBE_INTERVAL_MS ?? 60_000),

  probeIntervals: {
    sandboxMs: Number(process.env.PROBE_SANDBOX_INTERVAL_MS ?? 60_000),
    httpProbeMs: Number(process.env.PROBE_HTTP_INTERVAL_MS ?? 60_000),
    vendorStatusMs: Number(process.env.PROBE_VENDOR_INTERVAL_MS ?? 120_000),
  },

  stripe: {
    apiKey: process.env.PROBE_STRIPE_API_KEY
  },
  paystack: {
    apiKey: process.env.PROBE_PAYSTACK_API_KEY,
    currency: process.env.PROBE_PAYSTACK_CURRENCY ?? 'ZAR'
  },
  payfast: {
    merchantId: process.env.PROBE_PAYFAST_MERCHANT_ID,
    merchantKey: process.env.PROBE_PAYFAST_MERCHANT_KEY,
    passphrase: process.env.PROBE_PAYFAST_PASSPHRASE
  },
  flutterwave: {
    apiKey: process.env.PROBE_FLUTTERWAVE_API_KEY
  },
  mollie: {
    apiKey: process.env.PROBE_MOLLIE_API_KEY
  },
  razorpay: {
    keyId: process.env.PROBE_RAZORPAY_KEY_ID,
    keySecret: process.env.PROBE_RAZORPAY_KEY_SECRET
  },
  square: {
    accessToken: process.env.PROBE_SQUARE_ACCESS_TOKEN,
    locationId: process.env.PROBE_SQUARE_LOCATION_ID
  },
  mercadopago: {
    accessToken: process.env.PROBE_MERCADOPAGO_ACCESS_TOKEN
  },
  pesapal: {
    consumerKey: process.env.PROBE_PESAPAL_CONSUMER_KEY,
    consumerSecret: process.env.PROBE_PESAPAL_CONSUMER_SECRET
  },

  adminToken: process.env.PAYSTATUS_ADMIN_TOKEN,

  lagDetection: {
    enabled: process.env.LAG_DETECTION_ENABLED !== 'false',
    minConsecutiveDownTicks: Number(process.env.LAG_MIN_CONSECUTIVE_DOWN ?? 2),
    intervalMs: Number(process.env.LAG_DETECTION_INTERVAL_MS ?? 60_000),
  },
};
