/**
 * Agent CLI commands
 * agent list, status, chat, send, create, refresh
 */

import { Command } from 'commander';

/** Options for agent list command */
export interface AgentListOptions {
  type?: 'admin' | 'project' | 'skill';
}

/** Options for agent create command */
export interface AgentCreateOptions {
  type?: 'project' | 'skill';
  project?: string;
  name?: string;
}

/**
 * Register agent commands on the program
 */
export function registerAgentCommands(program: Command): void {
  const agentCmd = program
    .command('agent')
    .description('Agent management commands');

  // List agents
  agentCmd
    .command('list')
    .description('List all registered agents')
    .option('--type <type>', 'Filter by agent type (admin, project, skill)')
    .action(async (options: AgentListOptions) => {
      console.log('brain agent list - Not yet implemented');
      if (options.type) console.log(`Type filter: ${options.type}`);
    });

  // Agent status
  agentCmd
    .command('status <agent-id>')
    .description('Show agent status and context')
    .action(async (agentId: string) => {
      console.log(`brain agent status ${agentId} - Not yet implemented`);
    });

  // Interactive chat
  agentCmd
    .command('chat <agent-id>')
    .description('Start interactive chat session with an agent')
    .action(async (agentId: string) => {
      console.log(`brain agent chat ${agentId} - Not yet implemented`);
    });

  // Send message
  agentCmd
    .command('send <agent-id> <message>')
    .description('Send a single message to an agent and get response')
    .action(async (agentId: string, message: string) => {
      console.log(`brain agent send ${agentId} "${message}" - Not yet implemented`);
    });

  // Create agent
  agentCmd
    .command('create')
    .description('Create a new agent')
    .option('--type <type>', 'Agent type (project, skill)')
    .option('--project <name>', 'Project name (for project agents)')
    .option('--name <name>', 'Agent name (for skill agents)')
    .action(async (options: AgentCreateOptions) => {
      console.log('brain agent create - Not yet implemented');
      if (options.type) console.log(`Type: ${options.type}`);
      if (options.project) console.log(`Project: ${options.project}`);
      if (options.name) console.log(`Name: ${options.name}`);
    });

  // Refresh agent context
  agentCmd
    .command('refresh <agent-id>')
    .description('Refresh agent context from latest extractions')
    .action(async (agentId: string) => {
      console.log(`brain agent refresh ${agentId} - Not yet implemented`);
    });

  // Spawn agent (alias for create with immediate start)
  agentCmd
    .command('spawn')
    .description('Spawn a new agent instance')
    .option('--type <type>', 'Agent type (skill)')
    .option('--name <name>', 'Skill name')
    .action(async (options: AgentCreateOptions) => {
      console.log('brain agent spawn - Not yet implemented');
      if (options.type) console.log(`Type: ${options.type}`);
      if (options.name) console.log(`Name: ${options.name}`);
    });
}
