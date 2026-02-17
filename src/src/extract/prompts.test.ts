/**
 * Extraction prompts tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildExtractionPrompt,
  buildEntityExtractionPrompt,
  buildFactExtractionPrompt,
  buildTaskExtractionPrompt,
  buildSummaryPrompt,
  parseExtractionResponse,
  createEmptyResult,
  mergeExtractionResults,
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  type LLMExtractionResult,
} from './prompts.js';

describe('buildExtractionPrompt', () => {
  it('should build prompt with content', () => {
    const prompt = buildExtractionPrompt('Some text to analyze');
    
    expect(prompt).toContain('Some text to analyze');
    expect(prompt).toContain('JSON');
  });

  it('should include context when provided', () => {
    const prompt = buildExtractionPrompt('Content', 'This is from a meeting');
    
    expect(prompt).toContain('Context:');
    expect(prompt).toContain('This is from a meeting');
  });
});

describe('buildEntityExtractionPrompt', () => {
  it('should build entity extraction prompt', () => {
    const prompt = buildEntityExtractionPrompt('John works at Acme Corp');
    
    expect(prompt).toContain('John works at Acme Corp');
    expect(prompt).toContain('named entities');
    expect(prompt).toContain('person');
    expect(prompt).toContain('organization');
  });
});

describe('buildFactExtractionPrompt', () => {
  it('should build fact extraction prompt', () => {
    const prompt = buildFactExtractionPrompt('The sky is blue.');
    
    expect(prompt).toContain('The sky is blue.');
    expect(prompt).toContain('factual claims');
    expect(prompt).toContain('confidence');
  });
});

describe('buildTaskExtractionPrompt', () => {
  it('should build task extraction prompt', () => {
    const prompt = buildTaskExtractionPrompt('TODO: Review the document');
    
    expect(prompt).toContain('TODO: Review the document');
    expect(prompt).toContain('action items');
    expect(prompt).toContain('priority');
  });
});

describe('buildSummaryPrompt', () => {
  it('should build summary prompt', () => {
    const prompt = buildSummaryPrompt('Long content here...');
    
    expect(prompt).toContain('Long content here...');
    expect(prompt).toContain('Summarize');
  });

  it('should include max length when provided', () => {
    const prompt = buildSummaryPrompt('Content', 500);
    
    expect(prompt).toContain('500');
    expect(prompt).toContain('characters');
  });
});

describe('parseExtractionResponse', () => {
  it('should parse plain JSON', () => {
    const response = '{"entities": [], "facts": []}';
    const parsed = parseExtractionResponse(response);
    
    expect(parsed).toEqual({ entities: [], facts: [] });
  });

  it('should handle JSON in markdown code block', () => {
    const response = '```json\n{"entities": []}\n```';
    const parsed = parseExtractionResponse(response);
    
    expect(parsed).toEqual({ entities: [] });
  });

  it('should handle plain code block', () => {
    const response = '```\n{"facts": []}\n```';
    const parsed = parseExtractionResponse(response);
    
    expect(parsed).toEqual({ facts: [] });
  });

  it('should handle whitespace', () => {
    const response = '  \n{"data": true}\n  ';
    const parsed = parseExtractionResponse(response);
    
    expect(parsed).toEqual({ data: true });
  });

  it('should throw for invalid JSON', () => {
    expect(() => parseExtractionResponse('not json')).toThrow();
  });
});

describe('createEmptyResult', () => {
  it('should create empty result with all arrays', () => {
    const result = createEmptyResult();
    
    expect(result.entities).toEqual([]);
    expect(result.facts).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.insights).toEqual([]);
  });
});

describe('mergeExtractionResults', () => {
  it('should merge multiple results', () => {
    const result1: LLMExtractionResult = {
      entities: [{ name: 'John', type: 'person' }],
      facts: [{ content: 'Fact 1', confidence: 'high', entities: [] }],
      tasks: [],
      insights: [],
    };
    
    const result2: LLMExtractionResult = {
      entities: [{ name: 'Acme', type: 'organization' }],
      facts: [{ content: 'Fact 2', confidence: 'medium', entities: [] }],
      tasks: [{ content: 'Task 1' }],
      insights: [],
    };
    
    const merged = mergeExtractionResults([result1, result2]);
    
    expect(merged.entities).toHaveLength(2);
    expect(merged.facts).toHaveLength(2);
    expect(merged.tasks).toHaveLength(1);
  });

  it('should deduplicate entities by name', () => {
    const result1: LLMExtractionResult = {
      entities: [{ name: 'John', type: 'person' }],
      facts: [],
      tasks: [],
      insights: [],
    };
    
    const result2: LLMExtractionResult = {
      entities: [{ name: 'john', type: 'person' }], // Same name, different case
      facts: [],
      tasks: [],
      insights: [],
    };
    
    const merged = mergeExtractionResults([result1, result2]);
    
    expect(merged.entities).toHaveLength(1);
  });

  it('should merge key topics and deduplicate', () => {
    const result1: LLMExtractionResult = {
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
      key_topics: ['AI', 'ML'],
    };
    
    const result2: LLMExtractionResult = {
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
      key_topics: ['ML', 'NLP'],
    };
    
    const merged = mergeExtractionResults([result1, result2]);
    
    expect(merged.key_topics).toContain('AI');
    expect(merged.key_topics).toContain('ML');
    expect(merged.key_topics).toContain('NLP');
    expect(merged.key_topics?.filter((t: string) => t === 'ML')).toHaveLength(1);
  });
});

describe('EXTRACTION_SCHEMA', () => {
  it('should have required properties', () => {
    expect(EXTRACTION_SCHEMA.properties.entities).toBeDefined();
    expect(EXTRACTION_SCHEMA.properties.facts).toBeDefined();
    expect(EXTRACTION_SCHEMA.properties.tasks).toBeDefined();
    expect(EXTRACTION_SCHEMA.properties.insights).toBeDefined();
  });

  it('should have entity types enum', () => {
    const entityType = EXTRACTION_SCHEMA.properties.entities.items.properties.type;
    expect(entityType.enum).toContain('person');
    expect(entityType.enum).toContain('organization');
    expect(entityType.enum).toContain('concept');
  });
});

describe('EXTRACTION_SYSTEM_PROMPT', () => {
  it('should include extraction instructions', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Entities');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Facts');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Tasks');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('Insights');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('JSON');
  });
});
