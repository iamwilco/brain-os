/**
 * Agent templates
 * Templates for creating new agents
 */

import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';

/**
 * Agent type for template creation
 */
export type TemplateAgentType = 'admin' | 'project' | 'skill';

/**
 * Agent creation options
 */
export interface CreateAgentOptions {
  name: string;
  id?: string;
  type: TemplateAgentType;
  scope: string;
  description?: string;
  model?: string;
}

/**
 * Generate agent ID from name and type
 */
export function generateAgentId(name: string, type: TemplateAgentType): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `agent_${type}_${sanitized}`;
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate AGENT.md content for project agent
 */
export function generateProjectAgentMd(options: CreateAgentOptions): string {
  const id = options.id || generateAgentId(options.name, 'project');
  const date = getCurrentDate();
  const model = options.model || 'claude-sonnet-4-20250514';
  
  return `---
name: ${options.name}
id: ${id}
type: project
scope: "${options.scope}"
model: ${model}
created: ${date}
updated: ${date}
---

# ${options.name}

${options.description || `Project agent for ${options.name}.`}

## Identity

- **Name:** ${options.name}
- **Role:** Project Assistant
- **Scope:** ${options.scope}

## Capabilities

### Project Management
- Track project status and progress
- Maintain project documentation
- Answer questions about project context

### Knowledge Operations
- Search within project scope
- Maintain project-specific extractions
- Generate project summaries

## Guidelines

1. **Stay in scope** — Only access files within ${options.scope}
2. **Cite sources** — Reference specific files when providing information
3. **Update memory** — Keep working memory current
4. **Ask for clarity** — When uncertain, ask rather than assume

## Key Files

- **README:** Project overview and setup
- **MEMORY.md:** Working memory (this agent's state)
- **CONTEXT.md:** Auto-generated context from extractions

## Tools Available

\`\`\`bash
# Search within project
brain search "<query>" --scope path:${options.scope}

# Trigger extraction
brain extract --scope path:${options.scope}

# Run synthesis
brain synth weekly --scope path:${options.scope}
\`\`\`
`;
}

/**
 * Generate AGENT.md content for skill agent
 */
export function generateSkillAgentMd(options: CreateAgentOptions): string {
  const id = options.id || generateAgentId(options.name, 'skill');
  const date = getCurrentDate();
  const model = options.model || 'claude-sonnet-4-20250514';
  
  return `---
name: ${options.name}
id: ${id}
type: skill
scope: "${options.scope}"
model: ${model}
created: ${date}
updated: ${date}
---

# ${options.name}

${options.description || `Skill agent for ${options.name.toLowerCase()} tasks.`}

## Identity

- **Name:** ${options.name}
- **Role:** Skill Specialist
- **Scope:** Task-based (stateless)

## Capabilities

${options.description || '- Specialized skill capabilities\n- Task-focused execution'}

## Guidelines

1. **Task-focused** — Complete the specific task requested
2. **Stateless** — Do not rely on previous conversations
3. **Quality output** — Deliver polished, ready-to-use results
4. **Explain reasoning** — Share your thought process

## Usage

This skill agent is invoked for specific tasks and does not maintain persistent memory.
`;
}

/**
 * Generate MEMORY.md content
 */
export function generateMemoryMd(agentId: string, _agentName: string): string {
  const date = getCurrentDate();
  
  return `---
type: agent-memory
agent: ${agentId}
updated: ${date}
version: 1
---

# Working Memory

## Current State

- **Status:** Initialized
- **Last Active:** ${date}

## Key Context

*No context recorded yet.*

## Pending Actions

- [ ] Review project structure
- [ ] Index key files

## Important Notes

*No notes yet.*

## Questions to Resolve

*No open questions.*
`;
}

/**
 * Generate README.md for agent folder
 */
export function generateAgentReadme(options: CreateAgentOptions): string {
  const id = options.id || generateAgentId(options.name, options.type);
  
  return `# ${options.name} Agent

**ID:** \`${id}\`
**Type:** ${options.type}
**Scope:** ${options.scope}

## Files

| File | Purpose |
|------|---------|
| AGENT.md | Agent definition and capabilities |
| MEMORY.md | Persistent working memory |
| CONTEXT.md | Auto-generated context (do not edit) |
| sessions/ | Conversation transcripts |

## Usage

\`\`\`bash
# Chat with this agent
brain agent chat ${id}

# List sessions
brain agent sessions ${id}

# Regenerate context
brain agent context ${id} --regenerate
\`\`\`

## Notes

- CONTEXT.md is auto-generated during synthesis
- MEMORY.md persists across sessions
- Session transcripts are append-only
`;
}

/**
 * Create agent directory structure
 */
export async function createAgentDirectory(
  basePath: string,
  options: CreateAgentOptions
): Promise<{ path: string; id: string; files: string[] }> {
  const agentPath = join(basePath, 'agent');
  const sessionsPath = join(agentPath, 'sessions');
  const id = options.id || generateAgentId(options.name, options.type);
  const files: string[] = [];
  
  // Create directories
  if (!existsSync(agentPath)) {
    await mkdir(agentPath, { recursive: true });
  }
  if (!existsSync(sessionsPath)) {
    await mkdir(sessionsPath, { recursive: true });
  }
  
  // Generate and write AGENT.md
  const agentMd = options.type === 'project'
    ? generateProjectAgentMd({ ...options, id })
    : generateSkillAgentMd({ ...options, id });
  await writeFile(join(agentPath, 'AGENT.md'), agentMd);
  files.push('AGENT.md');
  
  // Generate and write MEMORY.md
  const memoryMd = generateMemoryMd(id, options.name);
  await writeFile(join(agentPath, 'MEMORY.md'), memoryMd);
  files.push('MEMORY.md');
  
  // Generate and write README.md
  const readme = generateAgentReadme({ ...options, id });
  await writeFile(join(agentPath, 'README.md'), readme);
  files.push('README.md');
  
  // Create empty sessions index
  await writeFile(
    join(sessionsPath, 'sessions.json'),
    JSON.stringify({ sessions: [] }, null, 2)
  );
  files.push('sessions/sessions.json');
  
  return { path: agentPath, id, files };
}

/**
 * Create project agent in a project folder
 */
export async function createProjectAgent(
  projectPath: string,
  options?: Partial<CreateAgentOptions>
): Promise<{ path: string; id: string; files: string[] }> {
  const projectName = basename(projectPath);
  const defaultScope = projectPath.replace(/.*?(30_Projects\/)/, '$1');
  
  const fullOptions: CreateAgentOptions = {
    name: options?.name || `${projectName} Agent`,
    type: 'project',
    scope: options?.scope || `${defaultScope}/**`,
    description: options?.description,
    model: options?.model,
    id: options?.id,
  };
  
  return createAgentDirectory(projectPath, fullOptions);
}

/**
 * Create skill agent in skills folder
 */
export async function createSkillAgent(
  skillsPath: string,
  skillName: string,
  options?: Partial<CreateAgentOptions>
): Promise<{ path: string; id: string; files: string[] }> {
  const skillPath = join(skillsPath, skillName.toLowerCase());
  
  const fullOptions: CreateAgentOptions = {
    name: options?.name || `${skillName} Agent`,
    type: 'skill',
    scope: options?.scope || '**/*',
    description: options?.description,
    model: options?.model,
    id: options?.id,
  };
  
  // Create skill folder
  if (!existsSync(skillPath)) {
    await mkdir(skillPath, { recursive: true });
  }
  
  return createAgentDirectory(skillPath, fullOptions);
}

/**
 * Check if agent already exists
 */
export function agentExists(basePath: string): boolean {
  return existsSync(join(basePath, 'agent', 'AGENT.md'));
}
