# PayStatus v0.1 - Sample Outputs

## Build Output

```bash
$ npm run build
> paystatus@0.1.0 build
> tsc

# Success - no errors
```

## Monitor Loop Output (Single Tick)

```
[2026-05-04T20:30:15.234Z] Starting probe tick...
  stripe: up (287ms)
  paystack: up (612ms)
  payfast: up (523ms)
  flutterwave: up (678ms)
  mollie: up (334ms)
  razorpay: down
  → Opened outage incident for razorpay
  square: degraded (4234ms)
  → Opened degraded incident for square
  mercadopago: up (289ms)
  pesapal: up (892ms)
[2026-05-04T20:30:28.567Z] Probe tick complete
```

## API Response Samples

### GET /api/status

```json
[
  {
    "provider": "stripe",
    "status": "up",
    "latencyMs": 287,
    "lastCheckedAt": "2026-05-04T17:45:30.234Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "paystack",
    "status": "up",
    "latencyMs": 612,
    "lastCheckedAt": "2026-05-04T17:45:31.156Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "payfast",
    "status": "up",
    "latencyMs": 523,
    "lastCheckedAt": "2026-05-04T17:45:32.023Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "flutterwave",
    "status": "up",
    "latencyMs": 678,
    "lastCheckedAt": "2026-05-04T17:45:33.145Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "mollie",
    "status": "up",
    "latencyMs": 334,
    "lastCheckedAt": "2026-05-04T17:45:33.789Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "razorpay",
    "status": "down",
    "latencyMs": 30012,
    "lastCheckedAt": "2026-05-04T17:45:34.023Z",
    "driftDetected": false,
    "errorMessage": "timeout of 30000ms exceeded"
  },
  {
    "provider": "square",
    "status": "degraded",
    "latencyMs": 4234,
    "lastCheckedAt": "2026-05-04T17:45:38.456Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "mercadopago",
    "status": "up",
    "latencyMs": 289,
    "lastCheckedAt": "2026-05-04T17:45:38.890Z",
    "driftDetected": false,
    "errorMessage": null
  },
  {
    "provider": "pesapal",
    "status": "up",
    "latencyMs": 892,
    "lastCheckedAt": "2026-05-04T17:45:39.678Z",
    "driftDetected": false,
    "errorMessage": null
  }
]
```

### GET /api/history?provider=stripe&hours=24

```json
[
  {
    "bucket": "2026-05-04T17:00:00.000Z",
    "up": 12,
    "down": 0,
    "p50LatencyMs": 287,
    "p95LatencyMs": 612
  },
  {
    "bucket": "2026-05-04T16:55:00.000Z",
    "up": 12,
    "down": 0,
    "p50LatencyMs": 294,
    "p95LatencyMs": 598
  },
  {
    "bucket": "2026-05-04T16:50:00.000Z",
    "up": 11,
    "down": 1,
    "p50LatencyMs": 312,
    "p95LatencyMs": 645
  }
]
```

### GET /api/incidents?limit=20

```json
[
  {
    "id": 142,
    "provider": "razorpay",
    "startedAt": "2026-05-04T17:42:15.234Z",
    "resolvedAt": null,
    "severity": "outage",
    "summary": "timeout of 30000ms exceeded"
  },
  {
    "id": 141,
    "provider": "square",
    "startedAt": "2026-05-04T09:11:23.567Z",
    "resolvedAt": "2026-05-04T09:18:45.123Z",
    "severity": "drift",
    "summary": "{\"added\":[\"payment_link.created_at_iso\"],\"removed\":[],\"typeChanged\":[]}"
  },
  {
    "id": 140,
    "provider": "payfast",
    "startedAt": "2026-05-03T14:22:11.890Z",
    "resolvedAt": "2026-05-03T14:25:33.456Z",
    "severity": "degraded",
    "summary": "latency 4567ms"
  }
]
```

### GET /api/uptime?provider=stripe&days=7

```json
{
  "provider": "stripe",
  "uptime": 99.92,
  "sampleSize": 10080
}
```

## File Structure (18 files created)

```
/root/paystatus/
├── package.json
├── package-lock.json
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── server.ts         # Express server, monitor loop startup
│   ├── config.ts         # Environment variable parsing
│   ├── db.ts             # PostgreSQL connection pool
│   ├── monitor.ts        # Probe loop, drift detection, incident tracking
│   └── api.ts            # API routes (status, history, incidents, uptime, subscribe)
├── public/
│   ├── index.html        # Static frontend (vanilla JS)
│   └── style.css         # Dark theme CSS
├── migrations/
│   └── 001_initial.sql   # Database schema
├── scripts/
│   └── migrate.ts        # Migration runner
└── dist/                 # TypeScript build output
    ├── server.js
    ├── config.js
    ├── db.js
    ├── monitor.js
    └── api.js
```

## Punted to v0.2+

1. **Alert delivery** - Subscribers table exists, POST /api/subscribe works, but no actual email/webhook delivery
2. **Multi-region probes** - Single VPS perspective only (latency measurements are from one location)
3. **Severity classification refinement** - Basic thresholds (2s degraded, 10s+ timeout), no retry logic for intermittent failures
4. **Historical drift visualization** - Drift detected and logged, but frontend only shows "—" in Last Drift column (no API endpoint yet)
5. **RSS feed** - Link exists but returns JSON (would need XML transform)
6. **Webhook delivery** - Link points to GitHub docs that don't exist yet
