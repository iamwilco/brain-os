/**
 * Tests for INTAKE stage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  IntakeError,
  isIntakeError,
  intakeErrorToHttpStatus,
  type IntakeInput,
} from './intake.js';
import { SessionLockManager } from '../session-lock.js';

describe('INTAKE Stage', () => {
  beforeEach(() => {
    SessionLockManager.resetInstance();
  });

  afterEach(() => {
    SessionLockManager.resetInstance();
  });

  describe('intake validation', () => {
    it('should throw VALIDATION_ERROR for empty message', async () => {
      const { intake } = await import('./intake.js');
      const input: IntakeInput = {
        message: '',
        vaultPath: '/tmp/vault',
        agentPath: '/tmp/vault/agent',
      };

      await expect(intake(input)).rejects.toThrow(IntakeError);
      await expect(intake(input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw VALIDATION_ERROR for whitespace-only message', async () => {
      const { intake } = await import('./intake.js');
      const input: IntakeInput = {
        message: '   \n\t  ',
        vaultPath: '/tmp/vault',
        agentPath: '/tmp/vault/agent',
      };

      await expect(intake(input)).rejects.toThrow(IntakeError);
      await expect(intake(input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw VALIDATION_ERROR for message exceeding max length', async () => {
      const { intake } = await import('./intake.js');
      const input: IntakeInput = {
        message: 'a'.repeat(100_001),
        vaultPath: '/tmp/vault',
        agentPath: '/tmp/vault/agent',
      };

      await expect(intake(input)).rejects.toThrow(IntakeError);
      await expect(intake(input)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('should throw AGENT_NOT_FOUND for non-existent agent path', async () => {
      const { intake } = await import('./intake.js');
      const input: IntakeInput = {
        message: 'Hello',
        vaultPath: '/tmp/vault',
        agentPath: '/non/existent/path',
      };

      await expect(intake(input)).rejects.toThrow(IntakeError);
      await expect(intake(input)).rejects.toMatchObject({
        code: 'AGENT_NOT_FOUND',
      });
    });
  });

  describe('isIntakeError', () => {
    it('should return true for IntakeError', () => {
      const error = new IntakeError('VALIDATION_ERROR', 'Test');
      expect(isIntakeError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isIntakeError(new Error('Test'))).toBe(false);
      expect(isIntakeError('string error')).toBe(false);
      expect(isIntakeError(null)).toBe(false);
    });
  });

  describe('intakeErrorToHttpStatus', () => {
    it('should map error codes to HTTP status codes', () => {
      expect(intakeErrorToHttpStatus('VALIDATION_ERROR')).toBe(400);
      expect(intakeErrorToHttpStatus('AGENT_NOT_FOUND')).toBe(404);
      expect(intakeErrorToHttpStatus('AGENT_INVALID')).toBe(400);
      expect(intakeErrorToHttpStatus('SESSION_NOT_FOUND')).toBe(404);
      expect(intakeErrorToHttpStatus('SESSION_TERMINATED')).toBe(410);
      expect(intakeErrorToHttpStatus('LOCK_TIMEOUT')).toBe(503);
      expect(intakeErrorToHttpStatus('LOCK_FAILED')).toBe(500);
    });
  });
});
