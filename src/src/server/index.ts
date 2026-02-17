/**
 * Fastify API Server
 * Backend server for Frontend Dashboard
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { initDatabase, getDatabaseStats, getDefaultDbPath } from '../db/connection.js';
import { version } from '../version.js';
import type { HealthResponse, StatsResponse } from '../api/types.js';
import { projectsRoutes } from './routes/projects.js';
import { sourcesRoutes } from './routes/sources.js';
import { agentsRoutes } from './routes/agents.js';
import { searchRoutes } from './routes/search.js';
import { runsRoutes } from './routes/runs.js';
import { eventsRoutes } from './routes/events.js';
import { artifactsRoutes } from './routes/artifacts.js';

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  host: string;
  vaultPath: string;
  corsOrigin?: string | string[];
  logger?: boolean;
}

/**
 * Default server configuration
 */
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3001,
  host: '127.0.0.1',
  vaultPath: process.cwd(),
  corsOrigin: ['http://localhost:5173', 'http://localhost:3000'],
  logger: true,
};

/**
 * Server state
 */
interface ServerState {
  startTime: number;
  db: Awaited<ReturnType<typeof initDatabase>>['db'] | null;
  vaultPath: string;
}

/**
 * Create and configure Fastify server
 */
export async function createServer(
  config: Partial<ServerConfig> = {}
): Promise<FastifyInstance> {
  const mergedConfig = { ...DEFAULT_SERVER_CONFIG, ...config };
  
  const server = Fastify({
    logger: mergedConfig.logger ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    } : false,
  });

  // Server state
  const state: ServerState = {
    startTime: Date.now(),
    db: null,
    vaultPath: mergedConfig.vaultPath,
  };

  // Register CORS
  await server.register(cors, {
    origin: mergedConfig.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Register WebSocket support
  await server.register(websocket);

  // Register multipart for file uploads
  await server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
      files: 20, // Max 20 files per request
    },
  });

  // Initialize database on startup
  server.addHook('onReady', async () => {
    try {
      const dbPath = getDefaultDbPath(state.vaultPath);
      const { db } = await initDatabase(dbPath);
      state.db = db;
      server.log.info(`Database initialized at ${dbPath}`);
    } catch (err) {
      server.log.error({ err }, 'Failed to initialize database');
    }
  });

  // Close database on shutdown
  server.addHook('onClose', async () => {
    if (state.db) {
      state.db.close();
      server.log.info('Database connection closed');
    }
  });

  // Health endpoint
  server.get('/health', async (_request, _reply): Promise<HealthResponse> => {
    const uptime = Math.floor((Date.now() - state.startTime) / 1000);
    
    let dbStats = {
      sources: 0,
      items: 0,
      projects: 0,
      agents: 0,
      runs: 0,
    };
    let dbConnected = false;
    let schemaVersion = 0;

    if (state.db) {
      try {
        const stats = getDatabaseStats(state.db);
        dbConnected = true;
        schemaVersion = stats.schemaVersion;
        dbStats = {
          sources: stats.sourceCount,
          items: stats.itemCount,
          projects: stats.projectCount,
          agents: 0, // Agents are file-based, not in DB
          runs: stats.runCount,
        };
      } catch {
        dbConnected = false;
      }
    }

    return {
      status: dbConnected ? 'ok' : 'degraded',
      version,
      uptime,
      database: {
        connected: dbConnected,
        schemaVersion,
      },
      counts: dbStats,
    };
  });

  // Stats endpoint
  server.get('/stats', async (_request, _reply): Promise<StatsResponse> => {
    if (!state.db) {
      throw { statusCode: 503, message: 'Database not available' };
    }

    const stats = getDatabaseStats(state.db);
    
    return {
      sources: stats.sourceCount,
      chunks: stats.chunkCount,
      items: stats.itemCount,
      entities: stats.entityCount,
      projects: stats.projectCount,
      agents: 0, // File-based
      runs: stats.runCount,
      artifacts: stats.artifactCount,
      collections: stats.collectionCount,
    };
  });

  // Decorate server with state access
  server.decorate('state', state);

  // Register routes
  await server.register(projectsRoutes);
  await server.register(sourcesRoutes);
  await server.register(agentsRoutes);
  await server.register(searchRoutes);
  await server.register(runsRoutes);
  await server.register(eventsRoutes);
  await server.register(artifactsRoutes);

  return server;
}

/**
 * Start the server
 */
export async function startServer(
  config: Partial<ServerConfig> = {}
): Promise<FastifyInstance> {
  const mergedConfig = { ...DEFAULT_SERVER_CONFIG, ...config };
  const server = await createServer(config);

  try {
    await server.listen({
      port: mergedConfig.port,
      host: mergedConfig.host,
    });
    
    console.log(`🚀 Server running at http://${mergedConfig.host}:${mergedConfig.port}`);
    console.log(`📁 Vault path: ${mergedConfig.vaultPath}`);
    
    return server;
  } catch (err) {
    server.log.error(err);
    throw err;
  }
}

/**
 * Stop the server
 */
export async function stopServer(server: FastifyInstance): Promise<void> {
  await server.close();
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    state: ServerState;
  }
}
