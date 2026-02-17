/**
 * Zod validation tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateExtractionResult,
  validateExtractionResultPartial,
  validateWithRetry,
  createValidatedExtractor,
  isExtractionResultShape,
  coerceExtractionResult,
  ValidationError,
  LLMExtractionResultSchema,
  ExtractedEntitySchema,
  ExtractedFactSchema,
} from './validation.js';

describe('LLMExtractionResultSchema', () => {
  it('should validate complete result', () => {
    const data = {
      entities: [{ name: 'John', type: 'person' }],
      facts: [{ content: 'A fact', confidence: 'high', entities: ['John'] }],
      tasks: [{ content: 'Do something' }],
      insights: [{ content: 'An insight' }],
    };

    const result = LLMExtractionResultSchema.parse(data);

    expect(result.entities).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
  });

  it('should accept empty arrays', () => {
    const data = {
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
    };

    const result = LLMExtractionResultSchema.parse(data);

    expect(result.entities).toEqual([]);
  });

  it('should reject invalid entity type', () => {
    const data = {
      entities: [{ name: 'John', type: 'invalid_type' }],
      facts: [],
      tasks: [],
      insights: [],
    };

    expect(() => LLMExtractionResultSchema.parse(data)).toThrow();
  });

  it('should reject missing required fields', () => {
    const data = {
      entities: [{ type: 'person' }], // missing name
      facts: [],
      tasks: [],
      insights: [],
    };

    expect(() => LLMExtractionResultSchema.parse(data)).toThrow();
  });
});

describe('ExtractedEntitySchema', () => {
  it('should validate entity with all fields', () => {
    const entity = {
      name: 'OpenAI',
      type: 'organization',
      description: 'AI research company',
      aliases: ['OAI'],
    };

    const result = ExtractedEntitySchema.parse(entity);

    expect(result.name).toBe('OpenAI');
    expect(result.aliases).toEqual(['OAI']);
  });

  it('should validate entity with minimal fields', () => {
    const entity = { name: 'Concept', type: 'concept' };
    const result = ExtractedEntitySchema.parse(entity);

    expect(result.name).toBe('Concept');
  });

  it('should reject empty name', () => {
    expect(() => ExtractedEntitySchema.parse({ name: '', type: 'person' })).toThrow();
  });
});

describe('ExtractedFactSchema', () => {
  it('should validate fact with all fields', () => {
    const fact = {
      content: 'The sky is blue',
      confidence: 'high',
      entities: ['sky'],
      source_quote: '"The sky is blue"',
    };

    const result = ExtractedFactSchema.parse(fact);

    expect(result.content).toBe('The sky is blue');
  });

  it('should reject invalid confidence', () => {
    const fact = {
      content: 'A fact',
      confidence: 'very_high', // invalid
      entities: [],
    };

    expect(() => ExtractedFactSchema.parse(fact)).toThrow();
  });
});

describe('validateExtractionResult', () => {
  it('should return validated result', () => {
    const data = {
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
    };

    const result = validateExtractionResult(data);

    expect(result).toEqual(data);
  });

  it('should throw ValidationError for invalid data', () => {
    const data = { invalid: true };

    try {
      validateExtractionResult(data);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues.length).toBeGreaterThan(0);
    }
  });

  it('should include raw data in error', () => {
    const data = { broken: 'data' };

    try {
      validateExtractionResult(data);
    } catch (error) {
      expect((error as ValidationError).rawData).toBe(data);
    }
  });
});

describe('ValidationError', () => {
  it('should format error messages', () => {
    const error = new ValidationError(
      'Validation failed',
      [
        { path: ['entities', 0, 'name'], message: 'Required', code: 'invalid_type', expected: 'string', received: 'undefined' },
        { path: ['facts'], message: 'Expected array', code: 'invalid_type', expected: 'array', received: 'undefined' },
      ],
      {}
    );

    const formatted = error.getFormattedErrors();

    expect(formatted).toContain('entities.0.name: Required');
    expect(formatted).toContain('facts: Expected array');
  });
});

describe('validateExtractionResultPartial', () => {
  it('should return valid items and skip invalid', () => {
    const data = {
      entities: [
        { name: 'Valid', type: 'person' },
        { name: '', type: 'person' }, // invalid - empty name
      ],
      facts: [],
      tasks: [],
      insights: [],
    };

    const { result, errors } = validateExtractionResultPartial(data);

    expect(result.entities).toHaveLength(1);
    expect(result.entities![0].name).toBe('Valid');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should handle non-object input', () => {
    const { result, errors } = validateExtractionResultPartial('not an object');

    expect(result.entities).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should preserve optional fields', () => {
    const data = {
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
      summary: 'A summary',
      key_topics: ['topic1', 'topic2'],
    };

    const { result } = validateExtractionResultPartial(data);

    expect(result.summary).toBe('A summary');
    expect(result.key_topics).toEqual(['topic1', 'topic2']);
  });
});

describe('validateWithRetry', () => {
  it('should return on first success', async () => {
    const extractFn = vi.fn().mockResolvedValue({
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
    });

    const result = await validateWithRetry(extractFn, validateExtractionResult);

    expect(extractFn).toHaveBeenCalledTimes(1);
    expect(result.entities).toEqual([]);
  });

  it('should retry on validation failure', async () => {
    const extractFn = vi
      .fn()
      .mockResolvedValueOnce({ invalid: true })
      .mockResolvedValueOnce({ entities: [], facts: [], tasks: [], insights: [] });

    const result = await validateWithRetry(extractFn, validateExtractionResult);

    expect(extractFn).toHaveBeenCalledTimes(2);
    expect(result.entities).toEqual([]);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const extractFn = vi
      .fn()
      .mockResolvedValueOnce({ invalid: true })
      .mockResolvedValueOnce({ entities: [], facts: [], tasks: [], insights: [] });

    await validateWithRetry(extractFn, validateExtractionResult, { onRetry });

    expect(onRetry).toHaveBeenCalledWith(1, expect.any(ValidationError));
  });

  it('should throw after max retries', async () => {
    const extractFn = vi.fn().mockResolvedValue({ invalid: true });

    await expect(
      validateWithRetry(extractFn, validateExtractionResult, { maxRetries: 2 })
    ).rejects.toThrow(ValidationError);

    expect(extractFn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('createValidatedExtractor', () => {
  it('should create a validated extraction function', async () => {
    const extractFn = vi.fn().mockResolvedValue({
      entities: [{ name: 'Test', type: 'concept' }],
      facts: [],
      tasks: [],
      insights: [],
    });

    const validatedExtract = createValidatedExtractor(extractFn);
    const result = await validatedExtract('some content');

    expect(result.entities).toHaveLength(1);
    expect(extractFn).toHaveBeenCalledWith('some content');
  });
});

describe('isExtractionResultShape', () => {
  it('should return true for valid shapes', () => {
    expect(isExtractionResultShape({ entities: [] })).toBe(true);
    expect(isExtractionResultShape({ facts: [] })).toBe(true);
    expect(isExtractionResultShape({ tasks: [], insights: [] })).toBe(true);
  });

  it('should return false for invalid shapes', () => {
    expect(isExtractionResultShape(null)).toBe(false);
    expect(isExtractionResultShape('string')).toBe(false);
    expect(isExtractionResultShape({ other: [] })).toBe(false);
  });
});

describe('coerceExtractionResult', () => {
  it('should add missing arrays', () => {
    const data = {};
    const result = coerceExtractionResult(data) as Record<string, unknown>;

    expect(result.entities).toEqual([]);
    expect(result.facts).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.insights).toEqual([]);
  });

  it('should normalize entity types', () => {
    const data = {
      entities: [{ name: 'Test', type: 'PERSON' }],
    };

    const result = coerceExtractionResult(data) as Record<string, unknown>;
    const entities = result.entities as Array<{ name: string; type: string }>;

    expect(entities[0].type).toBe('person');
  });

  it('should normalize confidence levels', () => {
    const data = {
      facts: [{ content: 'Fact', confidence: 'HIGH', entities: [] }],
    };

    const result = coerceExtractionResult(data) as Record<string, unknown>;
    const facts = result.facts as Array<{ confidence: string }>;

    expect(facts[0].confidence).toBe('high');
  });

  it('should handle invalid entity types', () => {
    const data = {
      entities: [{ name: 'Test', type: 'UNKNOWN_TYPE' }],
    };

    const result = coerceExtractionResult(data) as Record<string, unknown>;
    const entities = result.entities as Array<{ type: string }>;

    expect(entities[0].type).toBe('other');
  });
});
