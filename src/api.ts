import { Router, Request, Response } from 'express';
import { getPool } from './db';
import { config } from './config';
import { OFFICIAL_STATUS_URLS, SEVERITY_DISPLAY_LABELS } from './constants';

export const apiRouter = Router();

// GET /api/status - current layered state per provider
apiRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const { rows } = await getPool().query(`
      SELECT * FROM provider_current_state ORDER BY provider
    `);

    const enrichedRows = rows.map(row => {
      const layers: any = {};

      if (row.sandbox_status) {
        layers.sandbox = {
          status: row.sandbox_status,
          latencyMs: row.sandbox_latency_ms,
          checkedAt: row.sandbox_checked_at,
        };
      }

      if (row.http_status) {
        layers.httpProbe = {
          status: row.http_status,
          latencyMs: row.http_latency_ms,
          httpStatusCode: row.http_status_code,
          checkedAt: row.http_checked_at,
        };
      }

      if (row.vendor_status) {
        layers.vendorStatus = {
          status: row.vendor_status,
          indicator: row.vendor_indicator,
          description: row.vendor_description,
          checkedAt: row.vendor_checked_at,
        };
      }

      const statuses = [row.sandbox_status, row.http_status, row.vendor_status].filter(Boolean);
      const upCount = statuses.filter(s => s === 'up').length;
      const downCount = statuses.filter(s => s === 'down').length;

      let overall: string;
      let confidence: string;

      if (statuses.length === 0) {
        overall = 'unknown';
        confidence = 'low';
      } else if (upCount === statuses.length) {
        overall = 'up';
        confidence = statuses.length >= 2 ? 'high' : 'medium';
      } else if (downCount >= 2) {
        overall = 'down';
        confidence = 'high';
      } else if (downCount === 1 || statuses.some(s => s === 'degraded')) {
        overall = 'degraded';
        confidence = 'medium';
      } else {
        overall = 'up';
        confidence = 'low';
      }

      return {
        provider: row.provider,
        overall,
        confidence,
        layers,
      };
    });

    res.json(enrichedRows);
  } catch (err: any) {
    console.error('GET /api/status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/divergence - providers where layers disagree
apiRouter.get('/divergence', async (req: Request, res: Response) => {
  try {
    const { rows } = await getPool().query(`
      SELECT * FROM provider_current_state
    `);

    const divergences = [];

    for (const row of rows) {
      const vendorUp = row.vendor_status === 'up';
      const httpDown = row.http_status === 'down';
      const sandboxDown = row.sandbox_status === 'down';

      const vendorDown = row.vendor_status === 'down';
      const httpUp = row.http_status === 'up';
      const sandboxUp = row.sandbox_status === 'up';

      let divergenceType = null;
      let details = '';

      if (vendorUp && (httpDown || sandboxDown)) {
        divergenceType = 'vendor_says_up_probe_failing';
        const failingLayers = [];
        if (httpDown) failingLayers.push('HTTP probe');
        if (sandboxDown) failingLayers.push('sandbox');
        details = `Vendor reports operational; ${failingLayers.join(' and ')} failing`;
      } else if (vendorDown && (httpUp || sandboxUp)) {
        divergenceType = 'vendor_says_down_probe_ok';
        const okLayers = [];
        if (httpUp) okLayers.push('HTTP probe');
        if (sandboxUp) okLayers.push('sandbox');
        details = `Vendor reports issues; ${okLayers.join(' and ')} operational`;
      }

      if (divergenceType) {
        const since = [
          row.vendor_checked_at,
          row.http_checked_at,
          row.sandbox_checked_at,
        ]
          .filter(Boolean)
          .sort()
          .reverse()[0];

        divergences.push({
          provider: row.provider,
          divergence: divergenceType,
          details,
          since,
        });
      }
    }

    res.json(divergences);
  } catch (err: any) {
    console.error('GET /api/divergence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/history?provider=stripe&hours=24
apiRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider as string;
    const hours = Number(req.query.hours ?? 24);

    if (!provider) {
      return res.status(400).json({ error: 'provider query parameter required' });
    }

    const { rows } = await getPool().query(
      `
      SELECT
        date_trunc('hour', checked_at) +
          (extract(minute FROM checked_at)::int / 5) * interval '5 minutes' AS bucket,
        COUNT(*) FILTER (WHERE status = 'up') AS up,
        COUNT(*) FILTER (WHERE status = 'down') AS down,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS "p50LatencyMs",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS "p95LatencyMs"
      FROM status_checks
      WHERE provider = $1
        AND checked_at >= now() - interval '1 hour' * $2
      GROUP BY bucket
      ORDER BY bucket DESC
      `,
      [provider, hours]
    );

    res.json(rows);
  } catch (err: any) {
    console.error('GET /api/history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/incidents?limit=20
apiRouter.get('/incidents', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);

    const { rows } = await getPool().query(
      `
      SELECT
        id,
        provider,
        started_at AS "startedAt",
        resolved_at AS "resolvedAt",
        severity,
        summary
      FROM incidents
      ORDER BY started_at DESC
      LIMIT $1
      `,
      [limit]
    );

    const enrichedRows = rows.map(row => ({
      ...row,
      displayLabel: SEVERITY_DISPLAY_LABELS[row.severity] || row.severity,
    }));

    res.json(enrichedRows);
  } catch (err: any) {
    console.error('GET /api/incidents error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/uptime?provider=stripe&days=7
apiRouter.get('/uptime', async (req: Request, res: Response) => {
  try {
    const provider = req.query.provider as string;
    const days = Number(req.query.days ?? 7);

    if (!provider) {
      return res.status(400).json({ error: 'provider query parameter required' });
    }

    const { rows } = await getPool().query(
      `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'up' OR status = 'degraded') AS up_count
      FROM status_checks
      WHERE provider = $1
        AND checked_at >= now() - interval '1 day' * $2
      `,
      [provider, days]
    );

    const total = Number(rows[0]?.total ?? 0);
    const upCount = Number(rows[0]?.up_count ?? 0);
    const uptime = total > 0 ? (upCount / total) * 100 : 0;

    res.json({
      provider,
      uptime: Math.round(uptime * 100) / 100,
      sampleSize: total,
    });
  } catch (err: any) {
    console.error('GET /api/uptime error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/incidents/:id/resolve - admin endpoint
apiRouter.post('/incidents/:id/resolve', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== config.adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const id = Number(req.params.id);
    const { rowCount } = await getPool().query(
      'UPDATE incidents SET resolved_at = now() WHERE id = $1 AND resolved_at IS NULL',
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Incident not found or already resolved' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/incidents/:id/resolve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/about - service metadata and methodology
apiRouter.get('/about', async (req: Request, res: Response) => {
  try {
    res.json({
      name: 'paystatus',
      version: '0.2.0',
      scope: 'Independent 3-layer payment observatory. Tracks vendor status pages, HTTP probes, and sandbox health. Not affiliated with any provider.',
      methodology: {
        layer1: 'Vendor status page scraping (Statuspage.io API where available)',
        layer2: 'Public HTTP probe of production endpoints (no auth, 401/4xx = alive)',
        layer3: 'Sandbox health checks via PayBridge SDK',
        retryLogic: 'On any "down" signal, retry once after 5s before persisting',
        confidence: 'low=single layer, medium=confirmed retry or 3+ consecutive, high=2+ layers agree',
      },
      limitations: [
        'Single-region probe (JNB)',
        'Sandbox layer only covers providers with credentials configured',
        'Vendor scraper depends on Statuspage.io (some providers not available)',
        'May lag or differ from official provider status',
      ],
      officialSources: OFFICIAL_STATUS_URLS,
      providerCount: Object.keys(OFFICIAL_STATUS_URLS).length,
    });
  } catch (err: any) {
    console.error('GET /api/about error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/subscribe - store subscription (no delivery in v0.1)
apiRouter.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { email, provider, threshold } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    await getPool().query(
      'INSERT INTO subscribers (email, provider, threshold) VALUES ($1, $2, $3)',
      [email, provider ?? null, threshold ?? null]
    );

    res.json({
      success: true,
      message: "You'll receive your first alert when the next incident occurs.",
    });
  } catch (err: any) {
    console.error('POST /api/subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lag-events?limit=20&outcome=confirmed
apiRouter.get('/lag-events', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const outcome = (req.query.outcome as string) ?? 'confirmed';

    const { rows } = await getPool().query(
      `
      SELECT
        id,
        provider,
        our_detected_at AS "ourDetectedAt",
        our_layer AS "ourLayer",
        vendor_acknowledged_at AS "vendorAcknowledgedAt",
        lag_seconds AS "lagSeconds",
        resolved,
        outcome,
        summary,
        created_at AS "createdAt"
      FROM lag_events
      WHERE outcome = $1
      ORDER BY our_detected_at DESC
      LIMIT $2
      `,
      [outcome, limit]
    );

    res.json(rows);
  } catch (err: any) {
    console.error('GET /api/lag-events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lag-events/:id
apiRouter.get('/lag-events/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id — must be a positive integer' });
    }
    const { rows } = await getPool().query(
      `
      SELECT
        id,
        provider,
        our_detected_at AS "ourDetectedAt",
        our_layer AS "ourLayer",
        vendor_acknowledged_at AS "vendorAcknowledgedAt",
        lag_seconds AS "lagSeconds",
        resolved,
        outcome,
        summary,
        created_at AS "createdAt"
      FROM lag_events
      WHERE id = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lag event not found' });
    }

    res.json(rows[0]);
  } catch (err: any) {
    console.error('GET /api/lag-events/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lag-stats
apiRouter.get('/lag-stats', async (req: Request, res: Response) => {
  try {
    const windowDays = Number(req.query.days ?? 30);

    const { rows } = await getPool().query<{
      total: string;
      avg_lag: string;
      max_lag: string;
    }>(
      `
      SELECT
        COUNT(*)::text as total,
        AVG(lag_seconds)::int::text as avg_lag,
        MAX(lag_seconds)::text as max_lag
      FROM lag_events
      WHERE outcome = 'confirmed'
        AND our_detected_at > now() - interval '1 day' * $1
      `,
      [windowDays]
    );

    const totalConfirmed = Number(rows[0]?.total ?? 0);
    const averageLagSeconds = Number(rows[0]?.avg_lag ?? 0);
    const maxLagSeconds = Number(rows[0]?.max_lag ?? 0);

    const byProvider = await getPool().query<{
      provider: string;
      cnt: string;
      avg_lag: string;
      max_lag: string;
    }>(
      `
      SELECT
        provider,
        COUNT(*)::text as cnt,
        AVG(lag_seconds)::int::text as avg_lag,
        MAX(lag_seconds)::text as max_lag
      FROM lag_events
      WHERE outcome = 'confirmed'
        AND our_detected_at > now() - interval '1 day' * $1
      GROUP BY provider
      ORDER BY COUNT(*) DESC
      `,
      [windowDays]
    );

    const byProviderMap: Record<string, {count: number; avgLagSec: number; maxLagSec: number}> = {};
    for (const row of byProvider.rows) {
      byProviderMap[row.provider] = {
        count: Number(row.cnt),
        avgLagSec: Number(row.avg_lag),
        maxLagSec: Number(row.max_lag),
      };
    }

    res.json({
      totalConfirmed,
      averageLagSeconds,
      maxLagSeconds,
      byProvider: byProviderMap,
      windowDays,
    });
  } catch (err: any) {
    console.error('GET /api/lag-stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
