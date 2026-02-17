/**
 * Spawn Agent Tool
 * 
 * Tool definition for spawning skill agents from Admin agent.
 */

import {
  spawnSkillAgent,
  formatSpawnResult,
  listSkills,
  type SpawnConfig,
  type SpawnResult,
} from '../subagent.js';

/**
 * Tool definition for spawn_agent
 */
export interface SpawnAgentToolDef {
  name: 'spawn_agent';
  description: string;
  parameters: {
    type: 'object';
    properties: {
      skill_id: { type: 'string'; description: string };
      context: { type: 'string'; description: string };
      max_tokens: { type: 'number'; description: string };
      include_memory: { type: 'boolean'; description: string };
    };
    required: ['skill_id', 'context'];
  };
}

/**
 * Get the spawn_agent tool definition
 */
export function getSpawnAgentToolDef(): SpawnAgentToolDef {
  return {
    name: 'spawn_agent',
    description: 'Spawn a skill agent to perform a specialized task. Returns the skill agent\'s response.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'ID of the skill agent to spawn (e.g., "skill-seo", "skill-writer")',
        },
        context: {
          type: 'string',
          description: 'Context and instructions to pass to the skill agent',
        },
        max_tokens: {
          type: 'number',
          description: 'Maximum tokens for the skill agent response (default: 4000)',
        },
        include_memory: {
          type: 'boolean',
          description: 'Whether to include parent agent memory in skill context (default: false)',
        },
      },
      required: ['skill_id', 'context'],
    },
  };
}

/**
 * Tool arguments for spawn_agent
 */
export interface SpawnAgentArgs {
  skill_id: string;
  context: string;
  max_tokens?: number;
  include_memory?: boolean;
}

/**
 * Execute the spawn_agent tool
 */
export async function executeSpawnAgent(
  parentAgentPath: string,
  args: SpawnAgentArgs
): Promise<{ result: string; success: boolean; raw: SpawnResult }> {
  const config: SpawnConfig = {
    maxTokens: args.max_tokens,
    includeParentMemory: args.include_memory,
  };
  
  const result = await spawnSkillAgent(
    parentAgentPath,
    args.skill_id,
    args.context,
    config
  );
  
  return {
    result: formatSpawnResult(result),
    success: result.success,
    raw: result,
  };
}

/**
 * Tool definition for list_skills
 */
export interface ListSkillsToolDef {
  name: 'list_skills';
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, never>;
    required: [];
  };
}

/**
 * Get the list_skills tool definition
 */
export function getListSkillsToolDef(): ListSkillsToolDef {
  return {
    name: 'list_skills',
    description: 'List all available skill agents that can be spawned.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  };
}

/**
 * Execute the list_skills tool
 */
export function executeListSkills(): string {
  const skills = listSkills();
  
  if (skills.length === 0) {
    return 'No skill agents are currently registered.';
  }
  
  const lines: string[] = ['Available Skill Agents:', ''];
  
  for (const skill of skills) {
    lines.push(`- **${skill.id}**: ${skill.name}`);
    lines.push(`  ${skill.description}`);
    if (skill.capabilities.length > 0) {
      lines.push(`  Capabilities: ${skill.capabilities.join(', ')}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Get all spawn-related tool definitions
 */
export function getSpawnTools(): (SpawnAgentToolDef | ListSkillsToolDef)[] {
  return [getSpawnAgentToolDef(), getListSkillsToolDef()];
}
