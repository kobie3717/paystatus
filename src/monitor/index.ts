import { runSandboxLoop } from './sandbox';
import { runHTTPProbeLoop } from './http-probe';
import { runVendorStatusLoop } from './vendor-status';
import { runLagDetection } from './lag-detector';
import { config } from '../config';

interface MonitorIntervals {
  sandboxMs: number;
  httpProbeMs: number;
  vendorStatusMs: number;
}

export function startMonitorLoop(intervals: MonitorIntervals): NodeJS.Timeout[] {
  const sandboxTick = async () => {
    try {
      await runSandboxLoop();
    } catch (err) {
      console.error('Sandbox loop error:', err);
    }
  };

  const httpProbeTick = async () => {
    try {
      await runHTTPProbeLoop();
    } catch (err) {
      console.error('HTTP probe loop error:', err);
    }
  };

  const vendorStatusTick = async () => {
    try {
      await runVendorStatusLoop();
    } catch (err) {
      console.error('Vendor status loop error:', err);
    }
  };

  sandboxTick();
  httpProbeTick();
  vendorStatusTick();

  const handles: NodeJS.Timeout[] = [];

  const sandboxHandle = setInterval(sandboxTick, intervals.sandboxMs);
  if (sandboxHandle.unref) sandboxHandle.unref();
  handles.push(sandboxHandle);

  const httpProbeHandle = setInterval(httpProbeTick, intervals.httpProbeMs);
  if (httpProbeHandle.unref) httpProbeHandle.unref();
  handles.push(httpProbeHandle);

  const vendorStatusHandle = setInterval(vendorStatusTick, intervals.vendorStatusMs);
  if (vendorStatusHandle.unref) vendorStatusHandle.unref();
  handles.push(vendorStatusHandle);

  const lagDetectionTick = async () => {
    try {
      await runLagDetection();
    } catch (err) {
      console.error('Lag detection error:', err);
    }
  };

  if (config.lagDetection.enabled) {
    const lagDetectionHandle = setInterval(lagDetectionTick, config.lagDetection.intervalMs);
    if (lagDetectionHandle.unref) lagDetectionHandle.unref();
    handles.push(lagDetectionHandle);
  }

  return handles;
}
