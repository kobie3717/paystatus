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

// Start monitor loop
startMonitorLoop(config.probeIntervals);

// Start server
app.listen(config.port, () => {
  console.log(`PayStatus v0.2.0 listening on port ${config.port}`);
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
