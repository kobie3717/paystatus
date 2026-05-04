# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-04

### Hardening — Phase 1 critical rules from execution plan

- **Retry logic** — every probe failure triggers one retry after 5s. A single failure results in status `observed_failure` (tentative); 2 consecutive failures results in status `down` with incident.
- **Confidence scoring** — `low | medium | high` based on streak length (1, 2, 3+ consecutive same-status checks). Frontend displays confidence pill next to each status.
- **Anti-false-positive labeling** — every visible surface (frontend banner, API `attribution` field, footer, page metadata) labels this as independent sandbox-health monitoring, not an official outage page. Per-provider links to their canonical status page returned in `/api/status` and `/api/about`.
- New status type `observed_failure` distinguishing tentative from confirmed unreachability.
- New endpoint `GET /api/about` with methodology, limitations, official source URLs.
- Frontend disclaimer banner warns users this is not an official outage page and to verify with provider status pages.
- Incidents API response now includes `displayLabel` field with user-friendly severity descriptions.
- Database migrations 002 and 003 add `observed_failure` status type and `confidence` column.

### Changed

- Status check flow now includes retry-with-delay before marking as down.
- Consecutive failure tracking prevents opening incidents on transient network hiccups.
- Updated status label semantics to avoid claiming authoritative outage information.

## [0.1.0] - 2026-05-03

### Added

- Initial release of paystatus
- Multi-provider sandbox health monitoring (Stripe, PayStack, PayFast, Flutterwave, Mollie, Razorpay, Square, Mercado Pago, Pesapal)
- Real-time status checks every 60 seconds
- Schema drift detection using paybridge baseline comparison
- PostgreSQL storage for status checks and incidents
- REST API endpoints: `/api/status`, `/api/history`, `/api/incidents`, `/api/uptime`
- Web frontend with real-time status table and incident feed
- Email subscription storage (delivery not implemented)
- systemd service configuration
- nginx reverse proxy support
