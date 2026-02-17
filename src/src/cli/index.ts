#!/usr/bin/env node
/**
 * Brain CLI - Main entry point
 * Wilco OS Knowledge Management System
 */

import { Command } from 'commander';
import { version } from '../version.js';
import { registerCoreCommands } from './commands/core.js';
import { registerAgentCommands } from './commands/agent.js';
import { registerAdminCommands } from './commands/admin.js';

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('brain')
    .description('Wilco OS Brain - Local-first agentic PKM system')
    .version(version);

  // Register command groups
  registerCoreCommands(program);
  registerAgentCommands(program);
  registerAdminCommands(program);

  return program;
}

// Run CLI when executed directly (not when imported as module)
if (process.argv[1]?.includes('cli/index') || process.argv[1]?.includes('cli\\index')) {
  const program = createProgram();
  program.parse();
}
