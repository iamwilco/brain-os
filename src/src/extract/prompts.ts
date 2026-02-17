/**
 * Extraction prompts module
 * Prompts for structured knowledge extraction from text
 */

/**
 * Extracted entity
 */
export interface ExtractedEntity {
  name: string;
  type: 'person' | 'organization' | 'concept' | 'tool' | 'location' | 'event' | 'other';
  description?: string;
  aliases?: string[];
}

/**
 * Extracted fact/claim
 */
export interface ExtractedFact {
  content: string;
  confidence: 'high' | 'medium' | 'low';
  entities: string[];
  source_quote?: string;
}

/**
 * Extracted task/action item
 */
export interface ExtractedTask {
  content: string;
  priority?: 'high' | 'medium' | 'low';
  due_date?: string;
  context?: string;
}

/**
 * Extracted insight/idea
 */
export interface ExtractedInsight {
  content: string;
  tags?: string[];
  related_entities?: string[];
}

/**
 * Full LLM extraction result
 */
export interface LLMExtractionResult {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  tasks: ExtractedTask[];
  insights: ExtractedInsight[];
  summary?: string;
  key_topics?: string[];
}

/**
 * JSON schema for extraction output
 */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Entity name' },
          type: { 
            type: 'string', 
            enum: ['person', 'organization', 'concept', 'tool', 'location', 'event', 'other'],
            description: 'Entity type'
          },
          description: { type: 'string', description: 'Brief description' },
          aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names' },
        },
        required: ['name', 'type'],
      },
      description: 'Named entities mentioned in the text',
    },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The fact or claim' },
          confidence: { 
            type: 'string', 
            enum: ['high', 'medium', 'low'],
            description: 'Confidence level'
          },
          entities: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Related entity names'
          },
          source_quote: { type: 'string', description: 'Original quote from text' },
        },
        required: ['content', 'confidence', 'entities'],
      },
      description: 'Facts and claims extracted from the text',
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Task description' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          due_date: { type: 'string', description: 'Due date if mentioned' },
          context: { type: 'string', description: 'Additional context' },
        },
        required: ['content'],
      },
      description: 'Action items and tasks',
    },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The insight or idea' },
          tags: { type: 'array', items: { type: 'string' } },
          related_entities: { type: 'array', items: { type: 'string' } },
        },
        required: ['content'],
      },
      description: 'Key insights and ideas',
    },
    summary: {
      type: 'string',
      description: 'Brief summary of the content',
    },
    key_topics: {
      type: 'array',
      items: { type: 'string' },
      description: 'Main topics covered',
    },
  },
  required: ['entities', 'facts', 'tasks', 'insights'],
} as const;

/**
 * System prompt for extraction
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a knowledge extraction assistant. Your task is to analyze text and extract structured information.

Extract the following from the provided text:
1. **Entities**: People, organizations, concepts, tools, locations, events mentioned
2. **Facts**: Specific claims, statements, or pieces of information
3. **Tasks**: Action items, todos, or things to follow up on
4. **Insights**: Key ideas, realizations, or valuable observations

Guidelines:
- Be precise and factual
- Only extract information explicitly stated or strongly implied
- For facts, include the confidence level based on how definitively stated
- Link facts to relevant entities
- Preserve important context
- Do not invent or hallucinate information

Output your extraction as JSON matching the provided schema.`;

/**
 * Build extraction prompt for a piece of content
 */
export function buildExtractionPrompt(content: string, context?: string): string {
  let prompt = `Extract structured knowledge from the following text.\n\n`;
  
  if (context) {
    prompt += `Context: ${context}\n\n`;
  }
  
  prompt += `Text to analyze:\n"""\n${content}\n"""\n\n`;
  prompt += `Respond with a JSON object containing entities, facts, tasks, and insights.`;
  
  return prompt;
}

/**
 * Build prompt for entity-focused extraction
 */
export function buildEntityExtractionPrompt(content: string): string {
  return `Identify all named entities in the following text. For each entity, provide:
- name: The entity's name
- type: One of [person, organization, concept, tool, location, event, other]
- description: A brief description based on context
- aliases: Any alternative names or abbreviations used

Text:
"""
${content}
"""

Respond with a JSON array of entity objects.`;
}

/**
 * Build prompt for fact extraction
 */
export function buildFactExtractionPrompt(content: string): string {
  return `Extract all factual claims and statements from the following text. For each fact:
- content: The fact or claim in clear language
- confidence: high/medium/low based on how definitively stated
- entities: List of entity names this fact relates to
- source_quote: The relevant quote from the original text

Text:
"""
${content}
"""

Respond with a JSON array of fact objects.`;
}

/**
 * Build prompt for task extraction
 */
export function buildTaskExtractionPrompt(content: string): string {
  return `Identify any action items, tasks, or follow-ups mentioned in the following text. For each:
- content: The task description
- priority: high/medium/low if determinable
- due_date: Any mentioned deadline
- context: Relevant context for the task

Text:
"""
${content}
"""

Respond with a JSON array of task objects.`;
}

/**
 * Build prompt for summarization
 */
export function buildSummaryPrompt(content: string, maxLength?: number): string {
  const lengthInstruction = maxLength 
    ? `Keep the summary under ${maxLength} characters.` 
    : 'Keep the summary concise but comprehensive.';
    
  return `Summarize the following text. ${lengthInstruction}

Text:
"""
${content}
"""

Respond with a JSON object containing:
- summary: The summary text
- key_topics: Array of main topics covered`;
}

/**
 * Parse JSON from LLM response
 * Handles common issues like markdown code blocks
 */
export function parseExtractionResponse(response: string): unknown {
  let cleaned = response.trim();
  
  // Remove markdown code block if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  cleaned = cleaned.trim();
  
  return JSON.parse(cleaned);
}

/**
 * Create empty extraction result
 */
export function createEmptyResult(): LLMExtractionResult {
  return {
    entities: [],
    facts: [],
    tasks: [],
    insights: [],
  };
}

/**
 * Merge multiple extraction results
 */
export function mergeExtractionResults(results: LLMExtractionResult[]): LLMExtractionResult {
  const merged: LLMExtractionResult = createEmptyResult();
  
  for (const result of results) {
    merged.entities.push(...result.entities);
    merged.facts.push(...result.facts);
    merged.tasks.push(...result.tasks);
    merged.insights.push(...result.insights);
    
    if (result.key_topics) {
      merged.key_topics = merged.key_topics || [];
      merged.key_topics.push(...result.key_topics);
    }
  }
  
  // Deduplicate entities by name
  const entityMap = new Map<string, ExtractedEntity>();
  for (const entity of merged.entities) {
    const key = entity.name.toLowerCase();
    if (!entityMap.has(key)) {
      entityMap.set(key, entity);
    }
  }
  merged.entities = Array.from(entityMap.values());
  
  // Deduplicate topics
  if (merged.key_topics) {
    merged.key_topics = [...new Set(merged.key_topics)];
  }
  
  return merged;
}
