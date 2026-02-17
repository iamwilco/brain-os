/**
 * CLI tests
 */

import { describe, it, expect } from 'vitest';
import { createProgram } from './index.js';

describe('CLI', () => {
  it('should create program with correct name and description', () => {
    const program = createProgram();
    
    expect(program.name()).toBe('brain');
    expect(program.description()).toBe('Wilco OS Brain - Local-first agentic PKM system');
  });

  it('should have version set', () => {
    const program = createProgram();
    
    expect(program.version()).toBeDefined();
  });

  it('should register core commands', () => {
    const program = createProgram();
    const commands = program.commands.map(cmd => cmd.name());
    
    expect(commands).toContain('init');
    expect(commands).toContain('ingest');
    expect(commands).toContain('index');
    expect(commands).toContain('search');
    expect(commands).toContain('extract');
    expect(commands).toContain('synth');
    expect(commands).toContain('export');
  });

  it('should register agent command group', () => {
    const program = createProgram();
    const agentCmd = program.commands.find(cmd => cmd.name() === 'agent');
    
    expect(agentCmd).toBeDefined();
    
    const subcommands = agentCmd!.commands.map(cmd => cmd.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('chat');
    expect(subcommands).toContain('send');
    expect(subcommands).toContain('create');
    expect(subcommands).toContain('refresh');
    expect(subcommands).toContain('spawn');
  });

  it('should register admin command group', () => {
    const program = createProgram();
    const adminCmd = program.commands.find(cmd => cmd.name() === 'admin');
    
    expect(adminCmd).toBeDefined();
    
    const subcommands = adminCmd!.commands.map(cmd => cmd.name());
    expect(subcommands).toContain('status');
    expect(subcommands).toContain('docs');
    expect(subcommands).toContain('db');
    expect(subcommands).toContain('config');
  });

  it('should have correct command options', () => {
    const program = createProgram();
    
    // Check init command has vault option
    const initCmd = program.commands.find(cmd => cmd.name() === 'init');
    expect(initCmd).toBeDefined();
    const initOptions = initCmd!.options.map(opt => opt.long);
    expect(initOptions).toContain('--vault');
    
    // Check search command has scope and limit options
    const searchCmd = program.commands.find(cmd => cmd.name() === 'search');
    expect(searchCmd).toBeDefined();
    const searchOptions = searchCmd!.options.map(opt => opt.long);
    expect(searchOptions).toContain('--scope');
    expect(searchOptions).toContain('--limit');
  });
});
