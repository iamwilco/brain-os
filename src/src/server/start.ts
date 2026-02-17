#!/usr/bin/env node
/**
 * API Server Entry Point
 * Start with: npm run server
 */

import { startServer } from './index.js';
import path from 'path';

// Vault root is 2 levels up from src/ (src -> 40_Brain -> Wilco OS)
const vaultPath = process.env.VAULT_PATH || path.resolve(process.cwd(), '..', '..');

startServer({
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '127.0.0.1',
  vaultPath,
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
