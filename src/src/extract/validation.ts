/**
 * Zod validation for extraction output
 * Validates LLM responses and provides retry logic
 */

import { z } from 'zod';

/**
 * Entity type enum
 */
export const EntityTypeSchema = z.enum([
  'person',
  'organization', 
  'concept',
  'tool',
  'location',
  'event',
  'other',
]);

/**
 * Confidence level enum
 */
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

/**
 * Priority enum
 */
export const PrioritySchema = z.enum(['high', 'medium', 'low']);

/**
 * Extracted entity schema
 */
export const ExtractedEntitySchema = z.object({
  name: z.string().min(1, 'Entity name is required'),
  type: EntityTypeSchema,
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

/**
 * Extracted fact schema
 */
export const ExtractedFactSchema = z.object({
  content: z.string().min(1, 'Fact content is required'),
  confidence: ConfidenceSchema,
  entities: z.array(z.string()),
  source_quote: z.string().optional(),
});

/**
 * Extracted task schema
 */
export const ExtractedTaskSchema = z.object({
  content: z.string().min(1, 'Task content is required'),
  priority: PrioritySchema.optional(),
  due_date: z.string().optional(),
  context: z.string().optional(),
});

/**
 * Extracted insight schema
 */
export const ExtractedInsightSchema = z.object({
  content: z.string().min(1, 'Insight content is required'),
  tags: z.array(z.string()).optional(),
  related_entities: z.array(z.string()).optional(),
});

/**
 * Full LLM extraction result schema
 */
export const LLMExtractionResultSchema = z.object({
  entities: z.array(ExtractedEntitySchema),
  facts: z.array(ExtractedFactSchema),
  tasks: z.array(ExtractedTaskSchema),
  insights: z.array(ExtractedInsightSchema),
  summary: z.string().optional(),
  key_topics: z.array(z.string()).optional(),
});

/**
 * Inferred types from schemas
 */
export type ValidatedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ValidatedFact = z.infer<typeof ExtractedFactSchema>;
export type ValidatedTask = z.infer<typeof ExtractedTaskSchema>;
export type ValidatedInsight = z.infer<typeof ExtractedInsightSchema>;
export type ValidatedExtractionResult = z.infer<typeof LLMExtractionResultSchema>;

/**
 * Validation error with details
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly rawData: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }

  /**
   * Get formatted error messages
   */
  getFormattedErrors(): string[] {
    return this.issues.map(issue => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
  }
}

/**
 * Validate extraction result
 */
export function validateExtractionResult(data: unknown): ValidatedExtractionResult {
  const result = LLMExtractionResultSchema.safeParse(data);
  
  if (!result.success) {
    throw new ValidationError(
      'Extraction result validation failed',
      result.error.issues,
      data
    );
  }
  
  return result.data;
}

/**
 * Validate with partial results on failure
 * Returns valid items and skips invalid ones
 */
export function validateExtractionResultPartial(data: unknown): {
  result: Partial<ValidatedExtractionResult>;
  errors: string[];
} {
  const errors: string[] = [];
  const result: Partial<ValidatedExtractionResult> = {
    entities: [],
    facts: [],
    tasks: [],
    insights: [],
  };
  
  if (typeof data !== 'object' || data === null) {
    errors.push('Expected object, got ' + typeof data);
    return { result, errors };
  }
  
  const obj = data as Record<string, unknown>;
  
  // Validate entities
  if (Array.isArray(obj.entities)) {
    for (const entity of obj.entities) {
      const parsed = ExtractedEntitySchema.safeParse(entity);
      if (parsed.success) {
        result.entities!.push(parsed.data);
      } else {
        errors.push(`Invalid entity: ${parsed.error.issues[0].message}`);
      }
    }
  }
  
  // Validate facts
  if (Array.isArray(obj.facts)) {
    for (const fact of obj.facts) {
      const parsed = ExtractedFactSchema.safeParse(fact);
      if (parsed.success) {
        result.facts!.push(parsed.data);
      } else {
        errors.push(`Invalid fact: ${parsed.error.issues[0].message}`);
      }
    }
  }
  
  // Validate tasks
  if (Array.isArray(obj.tasks)) {
    for (const task of obj.tasks) {
      const parsed = ExtractedTaskSchema.safeParse(task);
      if (parsed.success) {
        result.tasks!.push(parsed.data);
      } else {
        errors.push(`Invalid task: ${parsed.error.issues[0].message}`);
      }
    }
  }
  
  // Validate insights
  if (Array.isArray(obj.insights)) {
    for (const insight of obj.insights) {
      const parsed = ExtractedInsightSchema.safeParse(insight);
      if (parsed.success) {
        result.insights!.push(parsed.data);
      } else {
        errors.push(`Invalid insight: ${parsed.error.issues[0].message}`);
      }
    }
  }
  
  // Validate optional fields
  if (typeof obj.summary === 'string') {
    result.summary = obj.summary;
  }
  
  if (Array.isArray(obj.key_topics)) {
    result.key_topics = obj.key_topics.filter(t => typeof t === 'string');
  }
  
  return { result, errors };
}

/**
 * Retry options for validation
 */
export interface RetryOptions {
  maxRetries?: number;
  onRetry?: (attempt: number, error: ValidationError) => void;
}

/**
 * Validate with retry logic
 * Calls the extract function again if validation fails
 */
export async function validateWithRetry<T>(
  extractFn: () => Promise<unknown>,
  validateFn: (data: unknown) => T,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const data = await extractFn();
      return validateFn(data);
    } catch (error) {
      if (error instanceof ValidationError) {
        lastError = error;
        if (attempt < maxRetries) {
          options.onRetry?.(attempt + 1, error);
        }
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

/**
 * Create a validation wrapper for extraction
 */
export function createValidatedExtractor(
  extractFn: (content: string) => Promise<unknown>,
  options: RetryOptions = {}
): (content: string) => Promise<ValidatedExtractionResult> {
  return async (content: string) => {
    return validateWithRetry(
      () => extractFn(content),
      validateExtractionResult,
      options
    );
  };
}

/**
 * Check if data looks like an extraction result
 */
export function isExtractionResultShape(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  
  return (
    Array.isArray(obj.entities) ||
    Array.isArray(obj.facts) ||
    Array.isArray(obj.tasks) ||
    Array.isArray(obj.insights)
  );
}

/**
 * Coerce common LLM response issues
 */
export function coerceExtractionResult(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = { ...obj };
  
  // Ensure arrays exist
  if (!Array.isArray(result.entities)) result.entities = [];
  if (!Array.isArray(result.facts)) result.facts = [];
  if (!Array.isArray(result.tasks)) result.tasks = [];
  if (!Array.isArray(result.insights)) result.insights = [];
  
  // Coerce entity types
  if (Array.isArray(result.entities)) {
    result.entities = (result.entities as unknown[]).map(e => {
      if (typeof e !== 'object' || e === null) return e;
      const entity = e as Record<string, unknown>;
      
      // Normalize type field
      if (typeof entity.type === 'string') {
        const type = entity.type.toLowerCase();
        const validTypes = ['person', 'organization', 'concept', 'tool', 'location', 'event', 'other'];
        if (!validTypes.includes(type)) {
          entity.type = 'other';
        } else {
          entity.type = type;
        }
      }
      
      return entity;
    });
  }
  
  // Coerce confidence levels
  if (Array.isArray(result.facts)) {
    result.facts = (result.facts as unknown[]).map(f => {
      if (typeof f !== 'object' || f === null) return f;
      const fact = f as Record<string, unknown>;
      
      if (typeof fact.confidence === 'string') {
        const conf = fact.confidence.toLowerCase();
        if (!['high', 'medium', 'low'].includes(conf)) {
          fact.confidence = 'medium';
        } else {
          fact.confidence = conf;
        }
      }
      
      // Ensure entities array exists
      if (!Array.isArray(fact.entities)) {
        fact.entities = [];
      }
      
      return fact;
    });
  }
  
  return result;
}
