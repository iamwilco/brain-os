/**
 * Binary file extraction tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isPdfFile,
  isDocxFile,
  isBinaryFile,
  extractFromPdf,
  extractFromDocx,
  extractFromBinary,
  extractWithFallback,
} from './binary.js';

describe('isPdfFile', () => {
  it('should return true for .pdf files', () => {
    expect(isPdfFile('document.pdf')).toBe(true);
    expect(isPdfFile('/path/to/file.PDF')).toBe(true);
  });

  it('should return false for non-pdf files', () => {
    expect(isPdfFile('document.docx')).toBe(false);
    expect(isPdfFile('document.txt')).toBe(false);
  });
});

describe('isDocxFile', () => {
  it('should return true for .docx files', () => {
    expect(isDocxFile('document.docx')).toBe(true);
    expect(isDocxFile('/path/to/file.DOCX')).toBe(true);
  });

  it('should return true for .doc files', () => {
    expect(isDocxFile('document.doc')).toBe(true);
  });

  it('should return false for non-docx files', () => {
    expect(isDocxFile('document.pdf')).toBe(false);
    expect(isDocxFile('document.txt')).toBe(false);
  });
});

describe('isBinaryFile', () => {
  it('should return true for supported binary files', () => {
    expect(isBinaryFile('file.pdf')).toBe(true);
    expect(isBinaryFile('file.docx')).toBe(true);
    expect(isBinaryFile('file.doc')).toBe(true);
  });

  it('should return false for unsupported files', () => {
    expect(isBinaryFile('file.txt')).toBe(false);
    expect(isBinaryFile('file.md')).toBe(false);
    expect(isBinaryFile('file.xlsx')).toBe(false);
  });
});

describe('extractFromPdf', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-pdf-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return error for non-existent file', async () => {
    const result = await extractFromPdf('/non/existent/file.pdf');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.fileType).toBe('pdf');
  });

  it('should return error for invalid PDF', async () => {
    const filePath = join(testDir, 'invalid.pdf');
    await writeFile(filePath, 'not a real pdf');
    
    const result = await extractFromPdf(filePath);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('extractFromDocx', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-docx-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return error for non-existent file', async () => {
    const result = await extractFromDocx('/non/existent/file.docx');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.fileType).toBe('docx');
  });

  it('should return error for invalid DOCX', async () => {
    const filePath = join(testDir, 'invalid.docx');
    await writeFile(filePath, 'not a real docx');
    
    const result = await extractFromDocx(filePath);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('extractFromBinary', () => {
  it('should route to PDF extraction for .pdf files', async () => {
    const result = await extractFromBinary('/fake/path.pdf');
    
    expect(result.fileType).toBe('pdf');
  });

  it('should route to DOCX extraction for .docx files', async () => {
    const result = await extractFromBinary('/fake/path.docx');
    
    expect(result.fileType).toBe('docx');
  });

  it('should return error for unsupported file types', async () => {
    const result = await extractFromBinary('/fake/path.xyz');
    
    expect(result.success).toBe(false);
    expect(result.fileType).toBe('unknown');
    expect(result.error).toContain('Unsupported file type');
  });
});

describe('extractWithFallback', () => {
  it('should provide fallback message on failure', async () => {
    const result = await extractWithFallback('/non/existent/file.pdf');
    
    expect(result.success).toBe(false);
    expect(result.content).toContain('Unable to extract text');
    expect(result.content).toContain('.pdf');
  });

  it('should include error in fallback message', async () => {
    const result = await extractWithFallback('/non/existent/file.docx');
    
    expect(result.content).toContain('Unable to extract text');
  });
});
