/**
 * Logger utility using pino
 */

import pino from 'pino';
import { getConfig } from '../config/index.js';

let _logger: pino.Logger | null = null;

/**
 * Get the logger instance
 */
export function getLogger(): pino.Logger {
  if (!_logger) {
    const config = getConfig();
    
    const transport = config.logFormat === 'pretty'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined;
    
    _logger = pino({
      level: config.logLevel,
      transport,
    });
  }
  return _logger;
}

/**
 * Create a child logger with context
 */
export function createLogger(context: Record<string, unknown>): pino.Logger {
  return getLogger().child(context);
}
