/**
 * Agent coordination and handoff
 * Enables agents to delegate tasks and aggregate results
 */

import { sendToAgent, resolveAgentPath } from './send.js';
import { receiveMessages, markAsProcessed } from './messaging.js';
import { invokeSkill } from './invoke.js';
import type { InvokeResult } from './invoke.js';

/**
 * Delegation request
 */
export interface DelegationRequest {
  fromAgent: string;
  toAgent: string;
  task: string;
  context?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  deadline?: string;
  expectResponse?: boolean;
}

/**
 * Delegation result
 */
export interface DelegationResult {
  success: boolean;
  delegationId: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  response?: unknown;
  error?: string;
  duration: number;
}

/**
 * Handoff request
 */
export interface HandoffRequest {
  fromAgent: string;
  toAgent: string;
  reason: string;
  context: HandoffContext;
  tasks?: string[];
}

/**
 * Context to transfer during handoff
 */
export interface HandoffContext {
  memory?: string;
  currentState?: string;
  pendingTasks?: string[];
  importantNotes?: string[];
  conversationSummary?: string;
}

/**
 * Handoff result
 */
export interface HandoffResult {
  success: boolean;
  handoffId: string;
  fromAgent: string;
  toAgent: string;
  acknowledged: boolean;
  error?: string;
  duration: number;
}

/**
 * Multi-agent task
 */
export interface MultiAgentTask {
  id: string;
  description: string;
  agents: string[];
  subtasks: Map<string, string>;
  results: Map<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

/**
 * Aggregated result from multiple agents
 */
export interface AggregatedResult {
  taskId: string;
  description: string;
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  results: Map<string, unknown>;
  errors: Map<string, string>;
  duration: number;
}

/**
 * Generate delegation ID
 */
export function generateDelegationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `del_${timestamp}_${random}`;
}

/**
 * Generate handoff ID
 */
export function generateHandoffId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `hnd_${timestamp}_${random}`;
}

/**
 * Generate task ID
 */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `task_${timestamp}_${random}`;
}

/**
 * Delegate task to another agent
 */
export async function delegateTask(
  vaultPath: string,
  request: DelegationRequest
): Promise<DelegationResult> {
  const start = Date.now();
  const delegationId = generateDelegationId();
  
  const result = await sendToAgent(
    vaultPath,
    request.fromAgent,
    request.toAgent,
    `Delegation: ${request.task}`,
    {
      delegationId,
      task: request.task,
      context: request.context || '',
      deadline: request.deadline,
      expectResponse: request.expectResponse ?? true,
    },
    {
      priority: request.priority,
      waitForResponse: false,
    }
  );
  
  if (!result.success) {
    return {
      success: false,
      delegationId,
      fromAgent: request.fromAgent,
      toAgent: request.toAgent,
      task: request.task,
      error: result.error,
      duration: Date.now() - start,
    };
  }
  
  return {
    success: true,
    delegationId,
    fromAgent: request.fromAgent,
    toAgent: request.toAgent,
    task: request.task,
    duration: Date.now() - start,
  };
}

/**
 * Perform handoff to another agent
 */
export async function performHandoff(
  vaultPath: string,
  request: HandoffRequest
): Promise<HandoffResult> {
  const start = Date.now();
  const handoffId = generateHandoffId();
  
  // Build context transfer payload
  const payload = {
    handoffId,
    reason: request.reason,
    context: request.context,
    tasks: request.tasks || [],
    handoffTime: new Date().toISOString(),
  };
  
  const result = await sendToAgent(
    vaultPath,
    request.fromAgent,
    request.toAgent,
    `Handoff: ${request.reason}`,
    payload,
    {
      priority: 'high',
      waitForResponse: false,
    }
  );
  
  if (!result.success) {
    return {
      success: false,
      handoffId,
      fromAgent: request.fromAgent,
      toAgent: request.toAgent,
      acknowledged: false,
      error: result.error,
      duration: Date.now() - start,
    };
  }
  
  return {
    success: true,
    handoffId,
    fromAgent: request.fromAgent,
    toAgent: request.toAgent,
    acknowledged: false,
    duration: Date.now() - start,
  };
}

/**
 * Distribute task across multiple agents
 */
export async function distributeTask(
  vaultPath: string,
  fromAgent: string,
  task: string,
  agents: string[],
  subtaskGenerator: (agent: string, task: string) => string
): Promise<MultiAgentTask> {
  const taskId = generateTaskId();
  const subtasks = new Map<string, string>();
  const results = new Map<string, unknown>();
  
  // Generate subtasks for each agent
  for (const agent of agents) {
    subtasks.set(agent, subtaskGenerator(agent, task));
  }
  
  // Delegate to each agent
  for (const [agent, subtask] of subtasks) {
    await delegateTask(vaultPath, {
      fromAgent,
      toAgent: agent,
      task: subtask,
      priority: 'normal',
      expectResponse: true,
    });
  }
  
  return {
    id: taskId,
    description: task,
    agents,
    subtasks,
    results,
    status: 'in_progress',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Collect results from distributed task
 */
export async function collectResults(
  vaultPath: string,
  agentId: string,
  taskId: string,
  expectedAgents: string[],
  timeout: number = 10000
): Promise<AggregatedResult> {
  const start = Date.now();
  const results = new Map<string, unknown>();
  const errors = new Map<string, string>();
  
  const agentPath = await resolveAgentPath(vaultPath, agentId);
  if (!agentPath) {
    return {
      taskId,
      description: '',
      totalAgents: expectedAgents.length,
      successfulAgents: 0,
      failedAgents: expectedAgents.length,
      results,
      errors: new Map([['_system', 'Agent path not found']]),
      duration: Date.now() - start,
    };
  }
  
  const pollInterval = 200;
  const maxPolls = Math.ceil(timeout / pollInterval);
  const receivedFrom = new Set<string>();
  
  for (let i = 0; i < maxPolls; i++) {
    // Check for responses
    const messages = await receiveMessages(agentPath, agentId, {
      type: 'response',
      unreadOnly: true,
    });
    
    for (const envelope of messages) {
      const from = envelope.message.from;
      if (expectedAgents.includes(from) && !receivedFrom.has(from)) {
        receivedFrom.add(from);
        results.set(from, envelope.message.payload);
        await markAsProcessed(agentPath, agentId, envelope.message.id);
      }
    }
    
    // Check if all received
    if (receivedFrom.size >= expectedAgents.length) {
      break;
    }
    
    await new Promise(r => setTimeout(r, pollInterval));
  }
  
  // Mark missing agents as errors
  for (const agent of expectedAgents) {
    if (!receivedFrom.has(agent)) {
      errors.set(agent, 'No response received');
    }
  }
  
  return {
    taskId,
    description: '',
    totalAgents: expectedAgents.length,
    successfulAgents: results.size,
    failedAgents: errors.size,
    results,
    errors,
    duration: Date.now() - start,
  };
}

/**
 * Coordinate skill chain execution
 */
export async function executeSkillChain(
  vaultPath: string,
  _fromAgent: string,
  chain: Array<{ skill: string; task: string; usePreviousResult?: boolean }>
): Promise<InvokeResult[]> {
  const results: InvokeResult[] = [];
  let previousResult: unknown = null;
  
  for (const step of chain) {
    let task = step.task;
    
    // Inject previous result if requested
    if (step.usePreviousResult && previousResult) {
      task = `${task}\n\nPrevious step result:\n${JSON.stringify(previousResult, null, 2)}`;
    }
    
    const result = await invokeSkill(vaultPath, step.skill, task);
    results.push(result);
    
    if (result.success) {
      previousResult = result.result;
    } else {
      break;
    }
  }
  
  return results;
}

/**
 * Format delegation result for display
 */
export function formatDelegationResult(result: DelegationResult): string {
  const lines: string[] = [];
  
  if (result.success) {
    lines.push(`✓ Task delegated (${result.delegationId})`);
    lines.push(`  From: ${result.fromAgent}`);
    lines.push(`  To: ${result.toAgent}`);
    lines.push(`  Task: ${result.task}`);
    lines.push(`  Duration: ${result.duration}ms`);
  } else {
    lines.push(`✗ Delegation failed: ${result.error}`);
    lines.push(`  Duration: ${result.duration}ms`);
  }
  
  return lines.join('\n');
}

/**
 * Format handoff result for display
 */
export function formatHandoffResult(result: HandoffResult): string {
  const lines: string[] = [];
  
  if (result.success) {
    lines.push(`✓ Handoff initiated (${result.handoffId})`);
    lines.push(`  From: ${result.fromAgent}`);
    lines.push(`  To: ${result.toAgent}`);
    lines.push(`  Duration: ${result.duration}ms`);
  } else {
    lines.push(`✗ Handoff failed: ${result.error}`);
  }
  
  return lines.join('\n');
}

/**
 * Format aggregated result for display
 */
export function formatAggregatedResult(result: AggregatedResult): string {
  const lines: string[] = [];
  
  lines.push('# Aggregated Results');
  lines.push(`Task: ${result.taskId}`);
  lines.push(`Total Agents: ${result.totalAgents}`);
  lines.push(`Successful: ${result.successfulAgents}`);
  lines.push(`Failed: ${result.failedAgents}`);
  lines.push(`Duration: ${result.duration}ms`);
  lines.push('');
  
  if (result.results.size > 0) {
    lines.push('## Results');
    for (const [agent, data] of result.results) {
      lines.push(`### ${agent}`);
      lines.push(JSON.stringify(data, null, 2));
    }
  }
  
  if (result.errors.size > 0) {
    lines.push('');
    lines.push('## Errors');
    for (const [agent, error] of result.errors) {
      lines.push(`- **${agent}**: ${error}`);
    }
  }
  
  return lines.join('\n');
}
