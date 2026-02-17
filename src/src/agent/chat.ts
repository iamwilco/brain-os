/**
 * Agent chat module
 * Interactive chat with agents
 */

import { createInterface, Interface } from 'readline';
import { join, dirname } from 'path';
import type { AgentDefinition } from './parser.js';
import { loadAgentDefinition, discoverAgents } from './parser.js';
import {
  createSession,
  getOrCreateSession,
  appendToTranscript,
  readTranscript,
  endSession,
  type SessionMetadata,
  type TranscriptMessage,
} from './session.js';

/**
 * Chat options
 */
export interface ChatOptions {
  agentId?: string;
  agentPath?: string;
  sessionId?: string;
  newSession?: boolean;
  systemPrompt?: string;
}

/**
 * Chat context
 */
export interface ChatContext {
  agent: AgentDefinition;
  session: SessionMetadata;
  agentPath: string;
  history: TranscriptMessage[];
}

/**
 * Message handler function type
 */
export type MessageHandler = (
  message: string,
  context: ChatContext
) => Promise<string>;

/**
 * Build system prompt from agent definition
 */
export function buildSystemPrompt(agent: AgentDefinition): string {
  const lines: string[] = [];
  
  lines.push(`You are ${agent.frontmatter.name}.`);
  lines.push('');
  
  if (agent.sections.identity) {
    lines.push('## Identity');
    lines.push(agent.sections.identity);
    lines.push('');
  }
  
  if (agent.sections.capabilities) {
    lines.push('## Capabilities');
    lines.push(agent.sections.capabilities);
    lines.push('');
  }
  
  if (agent.sections.guidelines) {
    lines.push('## Guidelines');
    lines.push(agent.sections.guidelines);
    lines.push('');
  }
  
  if (agent.sections.tools) {
    lines.push('## Available Tools');
    lines.push(agent.sections.tools);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format conversation history for context
 */
export function formatHistory(
  messages: TranscriptMessage[],
  maxMessages: number = 20
): string {
  const recent = messages.slice(-maxMessages);
  
  return recent
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

/**
 * Initialize chat context
 */
export async function initChatContext(
  vaultPath: string,
  options: ChatOptions
): Promise<ChatContext | null> {
  let agent: AgentDefinition | null = null;
  let agentPath: string;
  
  // Find agent by ID or path
  if (options.agentPath) {
    agentPath = options.agentPath;
    agent = await loadAgentDefinition(agentPath);
  } else if (options.agentId) {
    const agents = await discoverAgents(vaultPath);
    agent = agents.find(a => a.frontmatter.id === options.agentId) || null;
    if (agent) {
      agentPath = dirname(agent.path);
    } else {
      return null;
    }
  } else {
    // Default to admin agent
    agentPath = join(vaultPath, '40_Brain', 'agents', 'admin');
    agent = await loadAgentDefinition(agentPath);
  }
  
  if (!agent) {
    return null;
  }
  
  // Get or create session
  let session: SessionMetadata;
  if (options.newSession) {
    session = await createSession(agentPath, agent.frontmatter.id);
  } else {
    session = await getOrCreateSession(agentPath, agent.frontmatter.id);
  }
  
  // Load history
  const history = await readTranscript(agentPath, session.id);
  
  return {
    agent,
    session,
    agentPath,
    history,
  };
}

/**
 * Send a message in chat
 */
export async function sendMessage(
  context: ChatContext,
  userMessage: string,
  handler: MessageHandler
): Promise<string> {
  // Append user message to transcript
  const userMsg = await appendToTranscript(context.agentPath, context.session.id, {
    role: 'user',
    content: userMessage,
  });
  context.history.push(userMsg);
  
  // Get response from handler
  const response = await handler(userMessage, context);
  
  // Append assistant response to transcript
  const assistantMsg = await appendToTranscript(context.agentPath, context.session.id, {
    role: 'assistant',
    content: response,
  });
  context.history.push(assistantMsg);
  
  return response;
}

/**
 * Default message handler (echo for testing)
 */
export async function defaultHandler(
  message: string,
  context: ChatContext
): Promise<string> {
  return `[${context.agent.frontmatter.name}] Echo: ${message}`;
}

/**
 * Interactive chat loop
 */
export async function runInteractiveChat(
  context: ChatContext,
  handler: MessageHandler = defaultHandler,
  input: Interface = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
): Promise<void> {
  const agentName = context.agent.frontmatter.name;
  
  console.log(`\nChat with ${agentName}`);
  console.log(`Session: ${context.session.id}`);
  console.log('Type "exit" or "quit" to end the session.');
  console.log('Type "/new" to start a new session.');
  console.log('---\n');
  
  // Show recent history
  if (context.history.length > 0) {
    console.log('Recent history:');
    for (const msg of context.history.slice(-5)) {
      const prefix = msg.role === 'user' ? 'You' : agentName;
      console.log(`${prefix}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    }
    console.log('---\n');
  }
  
  const prompt = () => {
    input.question('You: ', async (userInput) => {
      const trimmed = userInput.trim();
      
      if (!trimmed) {
        prompt();
        return;
      }
      
      // Handle commands
      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('\nEnding session...');
        await endSession(context.agentPath, context.session.id, 'completed');
        input.close();
        return;
      }
      
      if (trimmed === '/new') {
        console.log('\nStarting new session...');
        const newSession = await createSession(
          context.agentPath,
          context.agent.frontmatter.id
        );
        context.session = newSession;
        context.history = [];
        console.log(`New session: ${newSession.id}\n`);
        prompt();
        return;
      }
      
      try {
        const response = await sendMessage(context, trimmed, handler);
        console.log(`\n${agentName}: ${response}\n`);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
      }
      
      prompt();
    });
  };
  
  prompt();
}

/**
 * Non-interactive single message exchange
 */
export async function chatOnce(
  vaultPath: string,
  message: string,
  options: ChatOptions,
  handler: MessageHandler = defaultHandler
): Promise<{ response: string; sessionId: string } | null> {
  const context = await initChatContext(vaultPath, options);
  if (!context) {
    return null;
  }
  
  const response = await sendMessage(context, message, handler);
  
  return {
    response,
    sessionId: context.session.id,
  };
}

/**
 * List available agents for chat
 */
export async function listChatAgents(
  vaultPath: string
): Promise<Array<{ id: string; name: string; type: string }>> {
  const agents = await discoverAgents(vaultPath);
  
  return agents.map(a => ({
    id: a.frontmatter.id,
    name: a.frontmatter.name,
    type: a.frontmatter.type,
  }));
}
