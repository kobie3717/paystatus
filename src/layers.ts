export interface VendorStatusHost {
  provider: string;
  statusHost: string | null;
}

export interface HTTPProbeEndpoint {
  provider: string;
  url: string;
  expectedStatuses: number[];
}

export const VENDOR_STATUS_HOSTS: VendorStatusHost[] = [
  { provider: 'stripe', statusHost: 'https://status.stripe.com' },
  { provider: 'paypal', statusHost: 'https://www.paypal-status.com' },
  { provider: 'adyen', statusHost: 'https://status.adyen.com' },
  { provider: 'paystack', statusHost: 'https://status.paystack.com' },
  { provider: 'mercadopago', statusHost: 'https://status.mercadopago.com' },
  { provider: 'square', statusHost: 'https://www.issquareup.com' },
  { provider: 'mollie', statusHost: 'https://status.mollie.com' },
  { provider: 'razorpay', statusHost: 'https://status.razorpay.com' },
  { provider: 'flutterwave', statusHost: 'https://status.flutterwave.com' },
  { provider: 'yoco', statusHost: 'https://status.yoco.com' },
  { provider: 'ozow', statusHost: 'https://status.ozow.com' },
  { provider: 'payfast', statusHost: 'https://status.payfast.io' },
  { provider: 'pesapal', statusHost: 'https://status.pesapal.com' },
  { provider: 'moonpay', statusHost: 'https://status.moonpay.com' },
  { provider: 'softycomp', statusHost: null },
  { provider: 'peach', statusHost: null },
  { provider: 'yellowcard', statusHost: null },
];

export const HTTP_PROBE_ENDPOINTS: HTTPProbeEndpoint[] = [
  { provider: 'stripe', url: 'https://api.stripe.com/v1/payment_intents', expectedStatuses: [401, 400] },
  { provider: 'paystack', url: 'https://api.paystack.co/transaction', expectedStatuses: [401, 400] },
  { provider: 'adyen', url: 'https://checkout-test.adyen.com/v71/sessions', expectedStatuses: [401, 400, 403, 422] },
  { provider: 'mollie', url: 'https://api.mollie.com/v2/payments', expectedStatuses: [401, 400] },
  { provider: 'razorpay', url: 'https://api.razorpay.com/v1/payments', expectedStatuses: [401, 400] },
  { provider: 'square', url: 'https://connect.squareup.com/v2/payments', expectedStatuses: [401, 400] },
  { provider: 'mercadopago', url: 'https://api.mercadopago.com/v1/payments', expectedStatuses: [401, 400] },
  { provider: 'flutterwave', url: 'https://api.flutterwave.com/v3/payments', expectedStatuses: [401, 400] },
  { provider: 'moonpay', url: 'https://api.moonpay.com/v3/currencies', expectedStatuses: [200] },
  { provider: 'payfast', url: 'https://www.payfast.co.za/eng/process', expectedStatuses: [200] },
  { provider: 'yoco', url: 'https://payments.yoco.com/api/checkouts', expectedStatuses: [401, 400, 404] },
  { provider: 'ozow', url: 'https://api.ozow.com/GetFinancialInstitutions', expectedStatuses: [401, 400, 405] },
  { provider: 'pesapal', url: 'https://pay.pesapal.com/v3/api/Auth/RequestToken', expectedStatuses: [405, 400] },
  { provider: 'softycomp', url: 'https://api.softycomp.co.za/SoftyCompBureauAPI/api/auth/generatetoken', expectedStatuses: [405, 400] },
  { provider: 'peach', url: 'https://eu-prod.oppwa.com/v1/checkouts', expectedStatuses: [401, 400] },
  { provider: 'yellowcard', url: 'https://api.yellowcard.io/v1/quotes/buy', expectedStatuses: [401, 400, 404] },
];

export const ALL_PROVIDERS = Array.from(
  new Set([
    ...VENDOR_STATUS_HOSTS.map(v => v.provider),
    ...HTTP_PROBE_ENDPOINTS.map(h => h.provider),
  ])
).sort();
