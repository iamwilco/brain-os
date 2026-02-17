/**
 * Admin Agent skill invocation
 * Allows Admin agent to invoke skill agents and get results
 */

import { join } from 'path';
import { discoverSkills, formatSkillAsToolDefinition } from './skill.js';
import { sendToSkill, resolveAgentPath, loadAgentContext } from './send.js';
import { receiveMessages, markAsProcessed } from './messaging.js';

/**
 * Skill invocation options
 */
export interface InvokeSkillOptions {
  context?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  timeout?: number;
  includeMemory?: boolean;
}

/**
 * Skill invocation result
 */
export interface InvokeResult {
  success: boolean;
  skillId: string;
  skillName: string;
  task: string;
  result?: unknown;
  error?: string;
  duration: number;
}

/**
 * Available skill info
 */
export interface AvailableSkill {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  category?: string;
}

/**
 * Get available skills for admin
 */
export async function getAvailableSkills(vaultPath: string): Promise<AvailableSkill[]> {
  const skillsPath = join(vaultPath, '40_Brain', 'agents', 'skills');
  const skills = await discoverSkills(skillsPath);
  
  return skills.map(skill => ({
    id: skill.frontmatter.id,
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    emoji: skill.frontmatter.metadata?.emoji,
    category: skill.frontmatter.metadata?.category,
  }));
}

/**
 * Get skill as tool definition for LLM
 */
export async function getSkillToolDefinitions(vaultPath: string): Promise<Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}>> {
  const skillsPath = join(vaultPath, '40_Brain', 'agents', 'skills');
  const skills = await discoverSkills(skillsPath);
  
  return skills.map(skill => formatSkillAsToolDefinition(skill));
}

/**
 * Invoke skill agent from admin
 */
export async function invokeSkill(
  vaultPath: string,
  skillName: string,
  task: string,
  options: InvokeSkillOptions = {}
): Promise<InvokeResult> {
  const start = Date.now();
  const skillId = `agent_skill_${skillName.toLowerCase()}`;
  const adminId = 'agent_admin';
  
  // Verify admin agent exists
  const adminPath = await resolveAgentPath(vaultPath, adminId);
  if (!adminPath) {
    return {
      success: false,
      skillId,
      skillName,
      task,
      error: 'Admin agent not found',
      duration: Date.now() - start,
    };
  }
  
  // Verify skill exists
  const skillPath = await resolveAgentPath(vaultPath, skillId);
  if (!skillPath) {
    return {
      success: false,
      skillId,
      skillName,
      task,
      error: `Skill agent not found: ${skillName}`,
      duration: Date.now() - start,
    };
  }
  
  // Build context
  let contextStr = options.context || '';
  if (options.includeMemory) {
    const adminContext = await loadAgentContext(adminPath, adminId);
    if (adminContext.memory) {
      contextStr = `## Admin Memory\n${adminContext.memory}\n\n${contextStr}`;
    }
  }
  
  // Send to skill
  const sendResult = await sendToSkill(
    vaultPath,
    adminId,
    skillName,
    task,
    contextStr,
    {
      priority: options.priority,
      waitForResponse: false,
    }
  );
  
  if (!sendResult.success) {
    return {
      success: false,
      skillId,
      skillName,
      task,
      error: sendResult.error,
      duration: Date.now() - start,
    };
  }
  
  return {
    success: true,
    skillId,
    skillName,
    task,
    result: { messageId: sendResult.messageId, status: 'sent' },
    duration: Date.now() - start,
  };
}

/**
 * Invoke skill and wait for result (simulated response)
 */
export async function invokeSkillSync(
  vaultPath: string,
  skillName: string,
  task: string,
  options: InvokeSkillOptions = {}
): Promise<InvokeResult> {
  const start = Date.now();
  const skillId = `agent_skill_${skillName.toLowerCase()}`;
  const adminId = 'agent_admin';
  
  // First invoke
  const invokeResult = await invokeSkill(vaultPath, skillName, task, options);
  if (!invokeResult.success) {
    return invokeResult;
  }
  
  // Poll for response
  const timeout = options.timeout || 5000;
  const pollInterval = 100;
  const maxPolls = Math.ceil(timeout / pollInterval);
  const adminPath = await resolveAgentPath(vaultPath, adminId);
  
  if (!adminPath) {
    return {
      ...invokeResult,
      error: 'Admin path not found for response polling',
      duration: Date.now() - start,
    };
  }
  
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval));
    
    const responses = await receiveMessages(adminPath, adminId, {
      type: 'response',
      from: skillId,
      unreadOnly: true,
    });
    
    if (responses.length > 0) {
      const response = responses[0];
      await markAsProcessed(adminPath, adminId, response.message.id);
      
      return {
        success: true,
        skillId,
        skillName,
        task,
        result: response.message.payload,
        duration: Date.now() - start,
      };
    }
  }
  
  // Timeout - return what we have
  return {
    success: true,
    skillId,
    skillName,
    task,
    result: invokeResult.result,
    error: 'Response timeout - task sent but no response received',
    duration: Date.now() - start,
  };
}

/**
 * Invoke multiple skills in parallel
 */
export async function invokeMultipleSkills(
  vaultPath: string,
  invocations: Array<{
    skillName: string;
    task: string;
    options?: InvokeSkillOptions;
  }>
): Promise<Map<string, InvokeResult>> {
  const results = new Map<string, InvokeResult>();
  
  // Run in parallel
  const promises = invocations.map(async ({ skillName, task, options }) => {
    const result = await invokeSkill(vaultPath, skillName, task, options);
    return { skillName, result };
  });
  
  const settled = await Promise.all(promises);
  
  for (const { skillName, result } of settled) {
    results.set(skillName, result);
  }
  
  return results;
}

/**
 * Format invoke result for display
 */
export function formatInvokeResult(result: InvokeResult): string {
  const lines: string[] = [];
  
  if (result.success) {
    lines.push(`✓ Skill invoked: ${result.skillName} (${result.skillId})`);
    lines.push(`  Task: ${result.task}`);
    lines.push(`  Duration: ${result.duration}ms`);
    
    if (result.result) {
      lines.push('');
      lines.push('### Result');
      lines.push(JSON.stringify(result.result, null, 2));
    }
    
    if (result.error) {
      lines.push(`  ⚠ ${result.error}`);
    }
  } else {
    lines.push(`✗ Skill invocation failed: ${result.skillName}`);
    lines.push(`  Error: ${result.error}`);
    lines.push(`  Duration: ${result.duration}ms`);
  }
  
  return lines.join('\n');
}

/**
 * Format available skills for display
 */
export function formatAvailableSkills(skills: AvailableSkill[]): string {
  if (skills.length === 0) {
    return 'No skills available.';
  }
  
  const lines: string[] = [];
  lines.push('# Available Skills');
  lines.push('');
  
  // Group by category
  const byCategory = new Map<string, AvailableSkill[]>();
  for (const skill of skills) {
    const category = skill.category || 'general';
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(skill);
  }
  
  for (const [category, categorySkills] of byCategory) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    lines.push('');
    
    for (const skill of categorySkills) {
      const emoji = skill.emoji || '🔧';
      lines.push(`### ${emoji} ${skill.name}`);
      lines.push(`**ID:** \`${skill.id}\``);
      lines.push(skill.description);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}
