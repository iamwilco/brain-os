/**
 * Skill Agent template
 * SKILL.md format definition and generation for skill agents
 * Compatible with OpenClaw pattern for LLM tool use
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Skill metadata
 */
export interface SkillMetadata {
  emoji?: string;
  category?: string;
  tags?: string[];
  version?: string;
}

/**
 * Skill frontmatter schema
 */
export interface SkillFrontmatter {
  name: string;
  id: string;
  description: string;
  metadata?: SkillMetadata;
}

/**
 * Parsed skill definition
 */
export interface SkillDefinition {
  frontmatter: SkillFrontmatter;
  content: string;
  sections: SkillSections;
  path: string;
}

/**
 * Skill sections extracted from markdown
 */
export interface SkillSections {
  capabilities?: string;
  responseFormat?: string;
  principles?: string;
  examples?: string;
  antiPatterns?: string;
  other: Record<string, string>;
}

/**
 * Skill creation options
 */
export interface CreateSkillOptions {
  name: string;
  id?: string;
  description: string;
  emoji?: string;
  category?: string;
  capabilities?: string[];
  responseFormat?: string;
  principles?: string[];
}

/**
 * Skill categories
 */
export const SKILL_CATEGORIES = [
  'thinking',
  'writing',
  'analysis',
  'research',
  'creative',
  'technical',
  'communication',
  'organization',
] as const;

export type SkillCategory = typeof SKILL_CATEGORIES[number];

/**
 * Generate skill ID from name
 */
export function generateSkillId(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `agent_skill_${sanitized}`;
}

/**
 * Parse simple YAML frontmatter
 */
function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split('\n');
  let inMetadata = false;
  const metadata: Record<string, unknown> = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Check for metadata block
    if (trimmed === 'metadata:') {
      inMetadata = true;
      continue;
    }
    
    // Handle metadata sub-keys
    if (inMetadata && line.startsWith('  ')) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        let value: unknown = trimmed.slice(colonIndex + 1).trim();
        
        // Remove quotes
        if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
          value = (value as string).slice(1, -1);
        }
        
        metadata[key] = value;
      }
      continue;
    } else if (inMetadata && !line.startsWith('  ')) {
      inMetadata = false;
      result.metadata = metadata;
    }
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();
    
    // Remove quotes
    if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    }
    
    result[key] = value;
  }
  
  if (inMetadata && Object.keys(metadata).length > 0) {
    result.metadata = metadata;
  }
  
  return result;
}

/**
 * Parse SKILL.md frontmatter
 */
export function parseSkillFrontmatter(content: string): {
  frontmatter: SkillFrontmatter | null;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: null, body: content };
  }
  
  try {
    const parsed = parseSimpleYaml(match[1]);
    
    if (!parsed.name || !parsed.id || !parsed.description) {
      return { frontmatter: null, body: match[2] };
    }
    
    return {
      frontmatter: {
        name: parsed.name as string,
        id: parsed.id as string,
        description: parsed.description as string,
        metadata: parsed.metadata as SkillMetadata | undefined,
      },
      body: match[2],
    };
  } catch {
    return { frontmatter: null, body: content };
  }
}

/**
 * Extract sections from skill markdown body
 */
export function extractSkillSections(body: string): SkillSections {
  const sections: SkillSections = { other: {} };
  const sectionRegex = /^##\s+(.+)$/gm;
  
  const sectionMatches: Array<{ title: string; start: number }> = [];
  let match;
  
  while ((match = sectionRegex.exec(body)) !== null) {
    sectionMatches.push({
      title: match[1].toLowerCase().trim(),
      start: match.index + match[0].length,
    });
  }
  
  for (let i = 0; i < sectionMatches.length; i++) {
    const current = sectionMatches[i];
    const next = sectionMatches[i + 1];
    const end = next ? next.start - next.title.length - 4 : body.length;
    const content = body.slice(current.start, end).trim();
    
    const title = current.title;
    
    if (title.includes('capabilities') || title.includes('capability')) {
      sections.capabilities = content;
    } else if (title.includes('response format') || title.includes('output')) {
      sections.responseFormat = content;
    } else if (title.includes('principles') || title.includes('guidelines')) {
      sections.principles = content;
    } else if (title.includes('examples') || title.includes('example')) {
      sections.examples = content;
    } else if (title.includes('anti-patterns') || title.includes('antipatterns') || title.includes('avoid')) {
      sections.antiPatterns = content;
    } else {
      sections.other[title] = content;
    }
  }
  
  return sections;
}

/**
 * Parse SKILL.md file
 */
export async function parseSkillDefinition(
  skillPath: string
): Promise<SkillDefinition | null> {
  const skillMdPath = skillPath.endsWith('.md')
    ? skillPath
    : join(skillPath, 'SKILL.md');
  
  if (!existsSync(skillMdPath)) {
    return null;
  }
  
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const { frontmatter, body } = parseSkillFrontmatter(content);
    
    if (!frontmatter) {
      return null;
    }
    
    const sections = extractSkillSections(body);
    
    return {
      frontmatter,
      content: body,
      sections,
      path: skillMdPath,
    };
  } catch {
    return null;
  }
}

/**
 * Generate SKILL.md content
 */
export function generateSkillMd(options: CreateSkillOptions): string {
  const id = options.id || generateSkillId(options.name);
  const lines: string[] = [];
  
  // Frontmatter
  lines.push('---');
  lines.push(`name: ${options.name.toLowerCase()}`);
  lines.push(`id: ${id}`);
  lines.push(`description: ${options.description}`);
  
  if (options.emoji || options.category) {
    lines.push('metadata:');
    if (options.emoji) {
      lines.push(`  emoji: "${options.emoji}"`);
    }
    if (options.category) {
      lines.push(`  category: ${options.category}`);
    }
  }
  
  lines.push('---');
  lines.push('');
  
  // Title
  const titleName = options.name.charAt(0).toUpperCase() + options.name.slice(1);
  lines.push(`# ${titleName} Skill Agent`);
  lines.push('');
  lines.push(`You are a ${options.name.toLowerCase()} specialist. ${options.description}`);
  lines.push('');
  
  // Capabilities
  lines.push('## Capabilities');
  lines.push('');
  if (options.capabilities && options.capabilities.length > 0) {
    for (const cap of options.capabilities) {
      lines.push(`- ${cap}`);
    }
  } else {
    lines.push('- [Add capabilities here]');
  }
  lines.push('');
  
  // Response Format
  lines.push('## Response Format');
  lines.push('');
  if (options.responseFormat) {
    lines.push(options.responseFormat);
  } else {
    lines.push('When responding, provide:');
    lines.push('');
    lines.push('```markdown');
    lines.push(`## ${titleName}: <Topic>`);
    lines.push('');
    lines.push('### Analysis');
    lines.push('[Your analysis here]');
    lines.push('');
    lines.push('### Recommendations');
    lines.push('1. ...');
    lines.push('2. ...');
    lines.push('');
    lines.push('### Next Steps');
    lines.push('- ...');
    lines.push('```');
  }
  lines.push('');
  
  // Principles
  lines.push('## Guiding Principles');
  lines.push('');
  if (options.principles && options.principles.length > 0) {
    options.principles.forEach((p, i) => {
      lines.push(`${i + 1}. ${p}`);
    });
  } else {
    lines.push('1. **Be specific** — Provide actionable guidance');
    lines.push('2. **Stay focused** — Address the task at hand');
    lines.push('3. **Explain reasoning** — Share your thought process');
  }
  lines.push('');
  
  // Anti-patterns
  lines.push('## Anti-Patterns');
  lines.push('');
  lines.push('- ❌ [Add anti-patterns to avoid]');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Create skill agent from SKILL.md template
 */
export async function createSkillFromTemplate(
  skillsBasePath: string,
  options: CreateSkillOptions
): Promise<{ path: string; id: string }> {
  const skillName = options.name.toLowerCase().replace(/\s+/g, '-');
  const skillPath = join(skillsBasePath, skillName);
  const id = options.id || generateSkillId(options.name);
  
  // Create directory
  if (!existsSync(skillPath)) {
    await mkdir(skillPath, { recursive: true });
  }
  
  // Generate and write SKILL.md
  const content = generateSkillMd({ ...options, id });
  await writeFile(join(skillPath, 'SKILL.md'), content, 'utf-8');
  
  return { path: skillPath, id };
}

/**
 * Format skill for OpenClaw tool definition
 * Compatible with LLM tool use patterns
 */
export function formatSkillAsToolDefinition(skill: SkillDefinition): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task or question for this skill agent',
        },
        context: {
          type: 'string',
          description: 'Optional additional context',
        },
      },
      required: ['task'],
    },
  };
}

/**
 * Get all skills from skills directory
 */
export async function discoverSkills(
  skillsBasePath: string
): Promise<SkillDefinition[]> {
  const { readdir } = await import('fs/promises');
  const skills: SkillDefinition[] = [];
  
  if (!existsSync(skillsBasePath)) {
    return skills;
  }
  
  try {
    const entries = await readdir(skillsBasePath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(skillsBasePath, entry.name);
        const skill = await parseSkillDefinition(skillPath);
        if (skill) {
          skills.push(skill);
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  
  return skills;
}

/**
 * Format skill list for display
 */
export function formatSkillList(skills: SkillDefinition[]): string {
  if (skills.length === 0) {
    return 'No skills found.';
  }
  
  const lines: string[] = [];
  lines.push('# Available Skills');
  lines.push('');
  
  for (const skill of skills) {
    const emoji = skill.frontmatter.metadata?.emoji || '🔧';
    const category = skill.frontmatter.metadata?.category || 'general';
    lines.push(`## ${emoji} ${skill.frontmatter.name}`);
    lines.push(`**ID:** \`${skill.frontmatter.id}\``);
    lines.push(`**Category:** ${category}`);
    lines.push('');
    lines.push(skill.frontmatter.description);
    lines.push('');
  }
  
  return lines.join('\n');
}
