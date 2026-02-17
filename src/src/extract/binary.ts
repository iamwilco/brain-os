/**
 * Binary file extraction module
 * Extracts text from PDF and DOCX files with graceful fallback
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * Binary extraction result
 */
export interface BinaryExtractionResult {
  content: string;
  pageCount?: number;
  wordCount: number;
  characterCount: number;
  fileType: 'pdf' | 'docx' | 'unknown';
  success: boolean;
  error?: string;
}

/**
 * Check if file is a PDF
 */
export function isPdfFile(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.pdf';
}

/**
 * Check if file is a DOCX
 */
export function isDocxFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === '.docx' || ext === '.doc';
}

/**
 * Check if file is a supported binary format
 */
export function isBinaryFile(filePath: string): boolean {
  return isPdfFile(filePath) || isDocxFile(filePath);
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words.length === 1 && words[0] === '' ? 0 : words.length;
}

/**
 * Extract text from PDF file
 */
export async function extractFromPdf(filePath: string): Promise<BinaryExtractionResult> {
  try {
    // Dynamic import to handle missing module gracefully
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any;
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    const buffer = await readFile(filePath);
    
    const data = await pdfParse(buffer);
    
    return {
      content: data.text,
      pageCount: data.numpages,
      wordCount: countWords(data.text),
      characterCount: data.text.length,
      fileType: 'pdf',
      success: true,
    };
  } catch (err) {
    return {
      content: '',
      wordCount: 0,
      characterCount: 0,
      fileType: 'pdf',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Extract text from DOCX file
 */
export async function extractFromDocx(filePath: string): Promise<BinaryExtractionResult> {
  try {
    // Dynamic import to handle missing module gracefully
    const mammoth = await import('mammoth');
    const buffer = await readFile(filePath);
    
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;
    
    return {
      content: text,
      wordCount: countWords(text),
      characterCount: text.length,
      fileType: 'docx',
      success: true,
    };
  } catch (err) {
    return {
      content: '',
      wordCount: 0,
      characterCount: 0,
      fileType: 'docx',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Extract text from any supported binary file
 */
export async function extractFromBinary(filePath: string): Promise<BinaryExtractionResult> {
  if (isPdfFile(filePath)) {
    return extractFromPdf(filePath);
  }
  
  if (isDocxFile(filePath)) {
    return extractFromDocx(filePath);
  }
  
  return {
    content: '',
    wordCount: 0,
    characterCount: 0,
    fileType: 'unknown',
    success: false,
    error: `Unsupported file type: ${extname(filePath)}`,
  };
}

/**
 * Extract text with fallback - tries binary extraction, falls back to empty
 */
export async function extractWithFallback(
  filePath: string
): Promise<BinaryExtractionResult> {
  const result = await extractFromBinary(filePath);
  
  // If extraction failed, return graceful fallback
  if (!result.success) {
    return {
      ...result,
      content: `[Unable to extract text from ${extname(filePath)} file: ${result.error}]`,
    };
  }
  
  return result;
}

/**
 * Batch extract from multiple files
 */
export async function extractFromFiles(
  filePaths: string[]
): Promise<Map<string, BinaryExtractionResult>> {
  const results = new Map<string, BinaryExtractionResult>();
  
  for (const filePath of filePaths) {
    results.set(filePath, await extractWithFallback(filePath));
  }
  
  return results;
}
