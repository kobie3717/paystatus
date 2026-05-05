import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { config } from './config';
import { apiRouter } from './api';
import { startMonitorLoop } from './monitor/index';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// API routes
app.use('/api', apiRouter);

// Lag event permalink route
app.get('/lag/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('<html><body><h1>400 - Invalid id</h1></body></html>');
    }
    const { getPool } = await import('./db');

    const eventResult = await getPool().query(
      `
      SELECT
        id,
        provider,
        our_detected_at,
        our_layer,
        vendor_acknowledged_at,
        lag_seconds,
        outcome,
        summary
      FROM lag_events
      WHERE id = $1 AND outcome = 'confirmed'
      `,
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).send('<html><body><h1>404 - Lag event not found</h1></body></html>');
    }

    const event = eventResult.rows[0];
    const lagMinutes = Math.floor(event.lag_seconds / 60);
    const lagRemainderSeconds = event.lag_seconds % 60;
    const lagFormatted = `${lagMinutes}m ${lagRemainderSeconds}s`;

    const timelineResult = await getPool().query(
      `
      SELECT
        checked_at,
        layer,
        status,
        latency_ms
      FROM status_checks
      WHERE provider = $1
        AND checked_at BETWEEN ($2::timestamptz - interval '15 minutes') AND ($2::timestamptz + interval '15 minutes')
      ORDER BY checked_at ASC
      `,
      [event.provider, event.our_detected_at]
    );

    const timelineRows = timelineResult.rows.map((row: any) => `
      <tr>
        <td>${new Date(row.checked_at).toISOString().replace('T', ' ').slice(0, 19)}</td>
        <td>${row.layer}</td>
        <td>${row.status}</td>
        <td>${row.latency_ms ?? '—'}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayStatus: ${event.provider} outage detected ${lagFormatted} ahead | ${new Date(event.our_detected_at).toISOString().slice(0, 10)}</title>
  <meta name="description" content="Independent monitoring caught ${event.provider} outage ${lagFormatted} before their official status page acknowledged it.">
  <meta property="og:title" content="PayStatus caught ${event.provider} outage ${lagFormatted} ahead">
  <meta property="og:description" content="${event.summary}">
  <meta property="og:type" content="article">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 30px; }
    .highlight { background: #fff3cd; padding: 20px; border-radius: 4px; margin: 20px 0; }
    .highlight strong { font-size: 18px; color: #856404; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; font-weight: 600; }
    .back { margin-top: 30px; }
    .back a { color: #0066cc; text-decoration: none; }
    .back a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Lag Event: ${event.provider}</h1>
  <div class="meta">Event ID: ${event.id} | Detected: ${new Date(event.our_detected_at).toISOString().replace('T', ' ').slice(0, 19)} SAST</div>

  <div class="highlight">
    <strong>Independent monitoring caught this outage ${lagFormatted} before the vendor acknowledged it.</strong>
    <p>Our ${event.our_layer} probe detected issues at ${new Date(event.our_detected_at).toISOString().slice(11, 19)} SAST. The vendor's status page acknowledged the outage at ${new Date(event.vendor_acknowledged_at).toISOString().slice(11, 19)} SAST — a ${event.lag_seconds}s (${lagFormatted}) lag.</p>
  </div>

  <h2>Timeline (±15 min)</h2>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Layer</th>
        <th>Status</th>
        <th>Latency (ms)</th>
      </tr>
    </thead>
    <tbody>
      ${timelineRows}
    </tbody>
  </table>

  <h2>Summary</h2>
  <p>${event.summary}</p>

  <div class="back">
    <a href="/">← Back to dashboard</a> | <a href="https://github.com/kobie3717/paybridge" target="_blank">Powered by PayBridge</a>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (err: any) {
    console.error('GET /lag/:id error:', err);
    res.status(500).send('<html><body><h1>500 - Internal server error</h1></body></html>');
  }
});

// Start monitor loop
startMonitorLoop(config.probeIntervals);

// Start server
app.listen(config.port, '127.0.0.1', () => {
  console.log(`PayStatus v0.2.0 listening on 127.0.0.1:${config.port}`);
  console.log(`Monitor intervals: sandbox=${config.probeIntervals.sandboxMs}ms, http=${config.probeIntervals.httpProbeMs}ms, vendor=${config.probeIntervals.vendorStatusMs}ms`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});
