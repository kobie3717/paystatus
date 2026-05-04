# PayStatus

**⚠ INDEPENDENT SANDBOX HEALTH MONITOR — NOT AN OFFICIAL OUTAGE PAGE**

Independent multi-provider payment observatory. Monitors API health, sandbox availability, schema drift, and latency for major payment providers continuously.

This service tracks `createPayment` success against each provider's public test sandbox from a single probe in Johannesburg. **Failures observed here may not reflect production outages.** Always confirm with the provider's official status page before assuming a real incident.

## What is this?

Stripe.com/status shows Stripe. PayFast shows PayFast. There's no neutral, multi-provider observability layer. PayStatus fills that gap using [paybridge](https://github.com/kobie3717/paybridge) to probe every major provider's sandbox API every 60 seconds.

**Scope:** We observe sandbox behavior. Providers report production status. Don't conflate the two.

## Monitored Providers

- Stripe
- PayStack
- PayFast
- Flutterwave
- Mollie
- Razorpay
- Square
- Mercado Pago
- Pesapal

## How it works

Every 60 seconds, PayStatus:

1. Calls `createPayment` on each provider's sandbox API with a minimal test amount
2. **On failure:** waits 5 seconds and retries once
3. Measures latency (up/degraded/down based on response time and success)
4. Tracks consecutive failures/successes for confidence scoring
5. Captures response shape and compares to baseline (drift detection)
6. Records results to PostgreSQL with confidence level
7. Opens/closes incidents automatically based on state transitions
8. **Lag detection** — compares our independent probe results against vendor status pages to measure acknowledgement delay

## Methodology

- **Single-region probe** — all checks originate from a VPS in Johannesburg (JNB)
- **Sandbox endpoints only** — production behavior may differ
- **Retry logic** — a single failure triggers a retry after 5s delay before marking as `observed_failure`
- **Incident threshold** — status `down` requires ≥2 consecutive failures to avoid false positives
- **Confidence scoring** — based on streak length: 1 check = low, 2 = medium, 3+ = high
- **Drift detection** — compares JSON response shape against stored baseline

## Status semantics

- **up** (🟢) — sandbox call succeeded, latency < 2s
- **degraded** (🟡) — succeeded but latency ≥2s, or first attempt failed but retry succeeded
- **observed_failure** (🟠) — single failure observed (tentative, no incident opened yet)
- **down** (🔴) — ≥2 consecutive failures (confirmed, incident opened)
- **drift** (🟣) — call succeeded but response schema changed vs. baseline
- **skipped** (⚪) — no credentials configured for this provider

## Official Provider Status Pages

Always verify with provider-confirmed status before assuming production impact:

- **Stripe** — https://www.stripestatus.com
- **PayStack** — https://paystack.statuspage.io
- **PayFast** — https://www.payfast.io
- **Flutterwave** — https://status.flutterwave.com
- **Mollie** — https://status.mollie.com
- **Razorpay** — https://status.razorpay.com
- **Square** — https://www.issquareup.com
- **Mercado Pago** — https://status.mercadopago.com
- **Pesapal** — https://www.pesapal.com

## Vendor Lag Detection

PayStatus records **lag events** when our independent probes detect an outage before a vendor's official status page acknowledges it.

### How it works

1. When sandbox or HTTP probes report `down` for 2+ consecutive ticks AND vendor status shows `up` → open a **pending lag event**
2. When vendor status transitions to `down`/`degraded` → mark event as **confirmed**, compute lag in seconds
3. When our probes recover without vendor acknowledgement → mark as **false alarm**
4. After 6 hours pending without vendor acknowledgement → auto-resolve as false alarm

### Why this matters

Official status pages often lag reality. Vendors require internal confirmation before publishing incidents. PayStatus's independent observatory catches these gaps:

> "PayBridge's independent observatory caught the Stripe outage 9 minutes before Stripe's status page admitted it."

### API Endpoints

- `GET /api/lag-events?limit=20&outcome=confirmed` — list confirmed lag events
- `GET /api/lag-stats?days=30` — aggregate statistics (avg lag, max lag, by provider)
- `GET /lag/:id` — permalink for individual lag event (SEO-optimized with OG tags)

### Dashboard Display

The public dashboard shows:
- Total confirmed outages detected in the current month
- Average lag time (how many minutes/seconds ahead we caught the issue)
- Per-provider breakdown
- Links to individual lag event permalinks for sharing

False alarms are recorded in the database but not displayed publicly.

## Limitations

This service has important constraints:

1. **Single-region probe** — failures may be specific to JNB network path
2. **Sandbox-only** — production endpoints may behave differently
3. **Rate limits** — provider API limits may produce false positives
4. **No SLA** — this is observational monitoring, not an authoritative status source
5. **Lag detection depends on vendor status page accuracy** — some providers don't publish timely status updates

## Deploy on existing VPS

### 1. Create database and migrate

```bash
# Create database user and database
sudo -u postgres psql -c "CREATE USER paystatus WITH PASSWORD '$(openssl rand -hex 16)';"
sudo -u postgres createdb -O paystatus paystatus

# Configure environment
cd /root/paystatus
cp .env.example .env
# Edit .env with database password and provider credentials

# Install dependencies and run migrations
npm install
npm run build
npx tsx scripts/migrate.ts
```

### 2. systemd service

Create `/etc/systemd/system/paystatus.service`:

```ini
[Unit]
Description=PayStatus - Payment Provider Observatory
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/paystatus
EnvironmentFile=/root/paystatus/.env
ExecStart=/usr/bin/node /root/paystatus/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=paystatus

# Security
NoNewPrivileges=true
PrivateTmp=true
ReadWritePaths=/var/log /tmp /var/lib/paystatus

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
mkdir -p /var/lib/paystatus/drift
systemctl daemon-reload
systemctl enable paystatus
systemctl start paystatus
systemctl status paystatus
```

### 3. nginx reverse proxy

Add server block for `status.whatshubb.co.za`:

```nginx
server {
    listen 80;
    server_name status.whatshubb.co.za;

    location / {
        proxy_pass http://127.0.0.1:4032;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable HTTPS:

```bash
certbot --nginx -d status.whatshubb.co.za
```

## API Endpoints

### `GET /api/status`

Current state per provider.

**Response:**

```json
[
  {
    "provider": "stripe",
    "status": "up",
    "latencyMs": 287,
    "lastCheckedAt": "2026-05-04T17:45:30Z",
    "driftDetected": false,
    "confidence": "high",
    "attribution": "Independent sandbox-health observation from JNB. Not an official outage report.",
    "officialStatus": "https://www.stripestatus.com"
  }
]
```

### `GET /api/history?provider=stripe&hours=24`

Historical checks for one provider, time-bucketed (5-min buckets).

**Response:**

```json
[
  {
    "bucket": "2026-05-04T17:00:00Z",
    "up": 12,
    "down": 0,
    "p50LatencyMs": 287,
    "p95LatencyMs": 612
  }
]
```

### `GET /api/incidents?limit=20`

Open + recently-resolved incidents, newest first.

**Response:**

```json
[
  {
    "id": 42,
    "provider": "razorpay",
    "startedAt": "2026-05-04T17:42:00Z",
    "resolvedAt": null,
    "severity": "outage",
    "summary": "timeout calling /v1/orders",
    "displayLabel": "Observed sandbox unreachability (≥2 consecutive failures)"
  }
]
```

### `GET /api/uptime?provider=stripe&days=7`

Percentage uptime over window.

**Response:**

```json
{
  "provider": "stripe",
  "uptime": 99.92,
  "sampleSize": 10080
}
```

### `POST /api/incidents/:id/resolve`

Admin endpoint for manual incident closure. Requires `Authorization: Bearer <PAYSTATUS_ADMIN_TOKEN>` header.

### `GET /api/about`

Service metadata, methodology, and limitations.

**Response:**

```json
{
  "name": "paystatus",
  "version": "0.1.1",
  "scope": "Independent sandbox-health monitoring. Probes provider test environments from JNB every 60s. Not an official outage page.",
  "methodology": "Single probe per provider per minute. After a failure, retry once with 5s delay. Status \"down\" requires ≥2 consecutive failures. Drift detection compares JSON response shape against a stored baseline.",
  "limitations": [
    "Single-region probe (JNB)",
    "Sandbox endpoints only — production behavior may differ",
    "Provider rate limits may produce false positives"
  ],
  "officialSources": {
    "stripe": "https://www.stripestatus.com",
    "paystack": "https://paystack.statuspage.io"
  },
  "providerCount": 9,
  "intervalMs": 60000
}
```

### `POST /api/subscribe`

Store email subscription. (Alert delivery not implemented in v0.1.)

**Request:**

```json
{
  "email": "you@example.com",
  "provider": "stripe",
  "threshold": "outage"
}
```

## Self-hosting

1. Clone this repo
2. Install Node.js 20+
3. `npm install`
4. Create PostgreSQL database
5. Copy `.env.example` to `.env` and configure
6. `npm run migrate`
7. `npm run build`
8. `npm start`

Frontend accessible at `http://localhost:4032`

## Credentials

Reuse your sandbox credentials from paybridge-playground. The `PROBE_*` prefix distinguishes them from other environment variables.

All probes use **sandbox mode only** and minimal test amounts:

- Stripe, Mollie, MercadoPago, Square: 1.0 base currency unit
- PayStack: 100 (ZAR, NGN, etc.)
- PayFast, Flutterwave: 1.0 ZAR
- Razorpay: 1.0 INR
- Pesapal: 100 KES

## What's punted to v0.2+

- **Alert delivery** — subscribers table exists, but no email/webhook delivery yet
- **Multi-region probes** — single VPS, single perspective
- **Severity classification refinement** — degraded vs. down thresholds are basic
- **Historical drift visualization** — just last drift timestamp for now

## License

MIT

## Powered by

[paybridge](https://github.com/kobie3717/paybridge) — open-source unified payment SDK supporting 10+ providers

## Changelog

### v0.2.0 (2026-05-04) - 3-Layer Production Observatory

**Pivot: sandbox-only → 3-layer monitoring**

Layer 1: Vendor status page scraper (Statuspage.io API where available)
Layer 2: Public HTTP probe of production endpoints (no auth, treats 401/4xx as alive)
Layer 3: Sandbox health (unchanged from v0.1)

#### Key Features

- **Confidence scoring across layers**: low=single layer, medium=confirmed retry or 3+ consecutive, high=2+ layers agree
- **Retry-once-before-persist**: On any 'down' signal, retry once after 5s to avoid false positives
- **Divergence detection**: Surfaces the most interesting moment when vendor says fine but our probes disagree
- **Multi-layer UI**: Frontend shows 3 mini-status indicators per provider plus overall computed from layer agreement
- **Independent monitoring disclaimer**: Prominently displays "INDEPENDENT MONITORING. Not affiliated with any provider."

#### API Endpoints

- `GET /api/status` - Returns layered status for all providers with overall computed state
- `GET /api/divergence` - Returns providers where layers disagree (vendor vs. probes)
- `GET /api/about` - Updated methodology documentation

#### Vendor Status Coverage

Working (Statuspage.io):
- Mercado Pago, Square, Flutterwave, Yoco

Errors/Invalid Format:
- Stripe (404), PayStack (404), Mollie (404), PayPal, Adyen, Razorpay, PayFast, MoonPay

Not Available:
- Ozow (DNS), Pesapal (DNS), SoftyComp, Peach Payments, Yellow Card

#### Known Limitations

- Single region (JNB). Multi-region in v0.3.
- Sandbox layer only covers providers with creds in /root/paystatus/.env
- Vendor scraper depends on Statuspage.io. Some providers use different status page systems or none at all.
- May lag or differ from official provider status

