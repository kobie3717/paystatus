import { getPool } from '../db';
import { config } from '../config';

const MIN_CONSECUTIVE_DOWN_TICKS = config.lagDetection.minConsecutiveDownTicks;
const FALSE_ALARM_WINDOW_HOURS = 6;

interface LayerStatus {
  status: string;
  checkedAt: Date;
}

export async function runLagDetection(): Promise<void> {
  if (!config.lagDetection.enabled) {
    return;
  }

  const providers = await getPool().query<{provider: string}>(`
    SELECT DISTINCT provider FROM status_checks
    WHERE checked_at > now() - interval '6 hours'
  `);

  for (const { provider } of providers.rows) {
    await detectLagFor(provider);
  }
}

async function detectLagFor(provider: string): Promise<void> {
  const statuses = await getPool().query<{layer: string; status: string; checked_at: Date}>(`
    SELECT DISTINCT ON (layer) layer, status, checked_at
    FROM status_checks
    WHERE provider = $1 AND checked_at > now() - interval '30 minutes'
    ORDER BY layer, checked_at DESC
  `, [provider]);

  const latestByLayer: Record<string, LayerStatus> = {};
  for (const row of statuses.rows) {
    latestByLayer[row.layer] = { status: row.status, checkedAt: row.checked_at };
  }

  const sandboxStatus = latestByLayer.sandbox?.status;
  const httpStatus = latestByLayer.http_probe?.status;
  const vendorStatus = latestByLayer.vendor_status?.status;

  const ourDown =
    (sandboxStatus === 'down' || httpStatus === 'down') &&
    !(sandboxStatus === 'skipped' && httpStatus === 'skipped');
  const vendorDown = vendorStatus === 'down' || vendorStatus === 'degraded';
  const vendorUp = vendorStatus === 'up' || vendorStatus === undefined;

  const pending = await getPool().query<{id: number; our_detected_at: Date}>(`
    SELECT id, our_detected_at FROM lag_events
    WHERE provider = $1 AND outcome = 'pending'
    ORDER BY our_detected_at DESC LIMIT 1
  `, [provider]);

  const pendingEvent = pending.rows[0];

  if (ourDown && vendorUp && !pendingEvent) {
    const downStreak = await countConsecutiveDownTicks(provider);
    if (downStreak < MIN_CONSECUTIVE_DOWN_TICKS) return;

    const ourLayer = computeWhichLayerDetectedFirst(latestByLayer);
    const ourDetectedAt = await getFirstDownTimestamp(provider);

    await getPool().query(`
      INSERT INTO lag_events (provider, our_detected_at, our_layer, summary)
      VALUES ($1, $2, $3, $4)
    `, [provider, ourDetectedAt, ourLayer, `${ourLayer} probe detected ${provider} down; vendor status: ${vendorStatus ?? 'no data'}`]);

    console.log(`  [LAG] OPENED: ${provider} (our_layer=${ourLayer})`);
    return;
  }

  if (pendingEvent && vendorDown) {
    const ourDetectedAt = pendingEvent.our_detected_at;
    const lagSeconds = Math.floor((Date.now() - ourDetectedAt.getTime()) / 1000);

    await getPool().query(`
      UPDATE lag_events
      SET vendor_acknowledged_at = now(),
          lag_seconds = $1,
          resolved = true,
          outcome = 'confirmed',
          summary = $2
      WHERE id = $3
    `, [lagSeconds, `Confirmed outage: vendor acknowledged ${lagSeconds}s after our independent detection`, pendingEvent.id]);

    console.log(`  [LAG] CONFIRMED: ${provider} (lag=${lagSeconds}s)`);
    return;
  }

  if (pendingEvent && !ourDown) {
    const vendorEverDown = await getPool().query<{cnt: string}>(`
      SELECT COUNT(*)::text as cnt FROM status_checks
      WHERE provider = $1 AND layer = 'vendor_status'
        AND status IN ('down', 'degraded')
        AND checked_at > $2
    `, [provider, pendingEvent.our_detected_at]);

    if (Number(vendorEverDown.rows[0].cnt) === 0) {
      await getPool().query(`
        UPDATE lag_events
        SET resolved = true,
            outcome = 'false_alarm',
            summary = 'Our probe recovered before vendor status changed; likely transient'
        WHERE id = $1
      `, [pendingEvent.id]);
      console.log(`  [LAG] FALSE ALARM: ${provider}`);
    }
    return;
  }

  if (pendingEvent) {
    const ageHours = (Date.now() - pendingEvent.our_detected_at.getTime()) / (1000 * 60 * 60);
    if (ageHours > FALSE_ALARM_WINDOW_HOURS) {
      await getPool().query(`
        UPDATE lag_events
        SET resolved = true,
            outcome = 'false_alarm',
            summary = 'Pending event exceeded 6h window without vendor acknowledgement'
        WHERE id = $1
      `, [pendingEvent.id]);
      console.log(`  [LAG] FALSE ALARM (timeout): ${provider}`);
    }
  }
}

async function countConsecutiveDownTicks(provider: string): Promise<number> {
  const rows = await getPool().query<{checked_at: Date; status: string; layer: string}>(`
    SELECT checked_at, status, layer
    FROM status_checks
    WHERE provider = $1 AND layer IN ('sandbox', 'http_probe')
      AND checked_at > now() - interval '10 minutes'
    ORDER BY checked_at DESC
    LIMIT 10
  `, [provider]);

  let streak = 0;
  for (const r of rows.rows) {
    if (r.status === 'down') streak++;
    else break;
  }
  return streak;
}

async function getFirstDownTimestamp(provider: string): Promise<Date> {
  const result = await getPool().query<{checked_at: Date}>(`
    SELECT MIN(checked_at) as checked_at
    FROM status_checks
    WHERE provider = $1 AND layer IN ('sandbox', 'http_probe') AND status = 'down'
      AND checked_at > now() - interval '30 minutes'
  `, [provider]);
  return result.rows[0]?.checked_at ?? new Date();
}

function computeWhichLayerDetectedFirst(latestByLayer: Record<string, LayerStatus>): 'sandbox' | 'http_probe' | 'both' {
  const sb = latestByLayer.sandbox?.status === 'down' ? latestByLayer.sandbox.checkedAt : null;
  const hp = latestByLayer.http_probe?.status === 'down' ? latestByLayer.http_probe.checkedAt : null;
  if (sb && hp) {
    if (Math.abs(sb.getTime() - hp.getTime()) < 60_000) return 'both';
    return sb < hp ? 'sandbox' : 'http_probe';
  }
  return sb ? 'sandbox' : 'http_probe';
}
