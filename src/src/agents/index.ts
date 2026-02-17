/**
 * Agents module
 * Agent management and communication
 */

// Placeholder - will be implemented in TASK-039+
export const agents = {
  list: async () => { throw new Error('Not implemented'); },
  get: async () => { throw new Error('Not implemented'); },
  create: async () => { throw new Error('Not implemented'); },
  send: async () => { throw new Error('Not implemented'); },
};

export interface Agent {
  id: string;
  name: string;
  type: 'admin' | 'project' | 'skill';
  scope: string;
  config: Record<string, unknown>;
}
