# SOP: Replacing Mock Providers with Real Implementations

## Problem

Many modules use mock providers (MockEmbeddingProvider, mock LLM responses, mock data in frontend). When wiring up real implementations, follow this pattern.

## Pattern

### 1. Keep the Interface

The existing interface should not change. Real and mock implementations both conform to it.

```typescript
// Keep this unchanged
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}
```

### 2. Create Real Implementation

```typescript
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  // Real implementation
}
```

### 3. Factory Function with Fallback

```typescript
export function createEmbeddingProvider(config: Config): EmbeddingProvider {
  if (config.embeddingModel) {
    try {
      return new TransformersEmbeddingProvider(config.embeddingModel);
    } catch (err) {
      logger.warn({ err }, 'Failed to load real embeddings, falling back to mock');
    }
  }
  return new MockEmbeddingProvider();
}
```

### 4. Update Tests

- Keep mock-based tests for unit testing (fast, deterministic)
- Add integration test with real provider (may be slow, mark as `.skip` in CI)

## Verification

1. Mock tests still pass: `npm run test`
2. Real provider works when configured: manual test with real API key
3. Graceful fallback when real provider unavailable
