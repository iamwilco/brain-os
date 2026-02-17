/**
 * Tests for Agent Message Protocol
 */

import { describe, it, expect } from 'vitest';
import {
  validateMessage,
  validateRequest,
  validateResponse,
  createRequest,
  createResponse,
  createNotify,
  successResponse,
  errorResponse,
  generateMessageId,
  SpawnAgentPayloadSchema,
  DelegateTaskPayloadSchema,
  TaskResultPayloadSchema,
  StatusQueryPayloadSchema,
  Operations,
  Events,
  type RequestMessage,
  type ResponseMessage,
  type NotifyMessage,
} from './protocol.js';

describe('Agent Message Protocol', () => {
  describe('generateMessageId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      
      expect(id1).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createRequest', () => {
    it('should create a valid request message', () => {
      const request = createRequest('admin', 'skill-seo', 'spawn_agent', {
        context: 'Analyze this page',
      });

      expect(request.type).toBe('request');
      expect(request.from).toBe('admin');
      expect(request.to).toBe('skill-seo');
      expect(request.operation).toBe('spawn_agent');
      expect(request.payload).toEqual({ context: 'Analyze this page' });
      expect(request.correlationId).toBe(request.id);
      expect(request.timestamp).toBeDefined();
    });

    it('should include optional timeout and metadata', () => {
      const request = createRequest('admin', 'skill', 'op', {}, {
        timeout: 5000,
        metadata: { priority: 'high' },
      });

      expect(request.timeout).toBe(5000);
      expect(request.metadata).toEqual({ priority: 'high' });
    });
  });

  describe('createResponse', () => {
    it('should create a success response', () => {
      const response = createResponse('skill', 'admin', 'corr-123', true, {
        result: 'Done',
      });

      expect(response.type).toBe('response');
      expect(response.from).toBe('skill');
      expect(response.to).toBe('admin');
      expect(response.correlationId).toBe('corr-123');
      expect(response.success).toBe(true);
      expect(response.payload).toEqual({ result: 'Done' });
    });

    it('should create an error response', () => {
      const response = createResponse('skill', 'admin', 'corr-123', false, null, 'Failed');

      expect(response.success).toBe(false);
      expect(response.error).toBe('Failed');
    });
  });

  describe('createNotify', () => {
    it('should create a notify message', () => {
      const notify = createNotify('admin', 'skill', 'memory:updated', {
        section: 'Current State',
      });

      expect(notify.type).toBe('notify');
      expect(notify.event).toBe('memory:updated');
      expect(notify.payload).toEqual({ section: 'Current State' });
    });
  });

  describe('successResponse', () => {
    it('should create success response from request', () => {
      const request = createRequest('admin', 'skill', 'op', {});
      const response = successResponse(request, 'skill', { result: 'ok' });

      expect(response.correlationId).toBe(request.id);
      expect(response.to).toBe('admin');
      expect(response.from).toBe('skill');
      expect(response.success).toBe(true);
    });
  });

  describe('errorResponse', () => {
    it('should create error response from request', () => {
      const request = createRequest('admin', 'skill', 'op', {});
      const response = errorResponse(request, 'skill', 'Something went wrong');

      expect(response.correlationId).toBe(request.id);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Something went wrong');
    });
  });

  describe('validateMessage', () => {
    it('should validate a correct message', () => {
      const message = createRequest('a', 'b', 'op', {});
      const result = validateMessage(message);

      expect(result.valid).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should reject invalid message', () => {
      const result = validateMessage({ foo: 'bar' });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateRequest', () => {
    it('should validate a correct request', () => {
      const request = createRequest('a', 'b', 'op', {});
      const result = validateRequest(request);

      expect(result.valid).toBe(true);
      expect(result.message?.operation).toBe('op');
    });

    it('should reject non-request message', () => {
      const response = createResponse('a', 'b', 'c', true, {});
      const result = validateRequest(response);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateResponse', () => {
    it('should validate a correct response', () => {
      const response = createResponse('a', 'b', 'corr', true, {});
      const result = validateResponse(response);

      expect(result.valid).toBe(true);
      expect(result.message?.success).toBe(true);
    });
  });

  describe('Payload Schemas', () => {
    describe('SpawnAgentPayloadSchema', () => {
      it('should validate spawn agent payload', () => {
        const payload = {
          skillId: 'skill-seo',
          context: 'Analyze this',
          params: { url: 'https://example.com' },
        };

        const result = SpawnAgentPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('should reject invalid spawn payload', () => {
        const result = SpawnAgentPayloadSchema.safeParse({ context: 'missing skillId' });
        expect(result.success).toBe(false);
      });
    });

    describe('DelegateTaskPayloadSchema', () => {
      it('should validate delegate task payload', () => {
        const payload = {
          task: 'Write a blog post',
          priority: 'high',
        };

        const result = DelegateTaskPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    describe('TaskResultPayloadSchema', () => {
      it('should validate task result payload', () => {
        const payload = {
          status: 'completed',
          summary: 'Task done successfully',
        };

        const result = TaskResultPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });

    describe('StatusQueryPayloadSchema', () => {
      it('should validate status query payload', () => {
        const payload = {
          target: 'session',
        };

        const result = StatusQueryPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Constants', () => {
    it('should have standard operations', () => {
      expect(Operations.SPAWN_AGENT).toBe('spawn_agent');
      expect(Operations.DELEGATE_TASK).toBe('delegate_task');
      expect(Operations.QUERY_STATUS).toBe('query_status');
    });

    it('should have standard events', () => {
      expect(Events.AGENT_STARTED).toBe('agent:started');
      expect(Events.AGENT_COMPLETED).toBe('agent:completed');
      expect(Events.MEMORY_UPDATED).toBe('memory:updated');
    });
  });
});
