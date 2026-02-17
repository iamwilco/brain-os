/**
 * Text extraction module
 * Extracts text content from markdown and plain text files
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * Extracted line with metadata
 */
export interface ExtractedLine {
  lineNumber: number;
  content: string;
  isEmpty: boolean;
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  content: string;
  lines: ExtractedLine[];
  lineCount: number;
  characterCount: number;
  wordCount: number;
  encoding: BufferEncoding;
  fileType: string;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  encoding?: BufferEncoding;
  preserveLineNumbers?: boolean;
  trimLines?: boolean;
  skipEmptyLines?: boolean;
  maxLines?: number;
}

const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  encoding: 'utf-8',
  preserveLineNumbers: true,
  trimLines: false,
  skipEmptyLines: false,
  maxLines: Infinity,
};

/**
 * Supported text file extensions
 */
export const TEXT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.log',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.xml',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.bat',
  '.cmd',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.scala',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.php',
  '.sql',
  '.r',
  '.R',
  '.lua',
  '.pl',
  '.pm',
  '.vim',
  '.el',
  '.lisp',
  '.clj',
  '.ex',
  '.exs',
  '.erl',
  '.hs',
  '.ml',
  '.fs',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.vue',
  '.svelte',
]);

/**
 * Check if a file is a supported text file
 */
export function isTextFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Get file type from extension
 */
export function getFileType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.txt' || ext === '.text') return 'plaintext';
  if (ext === '.json') return 'json';
  if (ext === '.jsonl') return 'jsonl';
  if (ext === '.csv') return 'csv';
  if (ext === '.xml') return 'xml';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.log') return 'log';
  
  // Programming languages
  if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.rb') return 'ruby';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (['.java', '.kt', '.scala'].includes(ext)) return 'jvm';
  if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) return 'c';
  if (ext === '.cs') return 'csharp';
  if (ext === '.swift') return 'swift';
  if (ext === '.php') return 'php';
  if (ext === '.sql') return 'sql';
  if (['.sh', '.bash', '.zsh', '.fish'].includes(ext)) return 'shell';
  
  return 'text';
}

/**
 * Detect encoding from BOM or default to UTF-8
 */
export function detectEncoding(buffer: Buffer): BufferEncoding {
  // UTF-8 BOM
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return 'utf-8';
  }
  
  // UTF-16 LE BOM
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf16le';
  }
  
  // UTF-16 BE BOM (Node doesn't support this directly, treat as utf-8)
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf-8';
  }
  
  // Default to UTF-8
  return 'utf-8';
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words.length === 1 && words[0] === '' ? 0 : words.length;
}

/**
 * Extract text from a string
 */
export function extractFromString(
  content: string,
  options: ExtractionOptions = {}
): ExtractionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const rawLines = content.split(/\r?\n/);
  const lines: ExtractedLine[] = [];
  let lineNumber = 0;
  
  for (const rawLine of rawLines) {
    lineNumber++;
    
    if (lineNumber > opts.maxLines) break;
    
    const processedContent = opts.trimLines ? rawLine.trim() : rawLine;
    const isEmpty = processedContent.length === 0;
    
    if (opts.skipEmptyLines && isEmpty) continue;
    
    lines.push({
      lineNumber: opts.preserveLineNumbers ? lineNumber : lines.length + 1,
      content: processedContent,
      isEmpty,
    });
  }
  
  const extractedContent = lines.map(l => l.content).join('\n');
  
  return {
    content: extractedContent,
    lines,
    lineCount: lines.length,
    characterCount: extractedContent.length,
    wordCount: countWords(extractedContent),
    encoding: opts.encoding,
    fileType: 'text',
  };
}

/**
 * Extract text from a file
 */
export async function extractFromFile(
  filePath: string,
  options: ExtractionOptions = {}
): Promise<ExtractionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Read file as buffer first to detect encoding
  const buffer = await readFile(filePath);
  const detectedEncoding = opts.encoding || detectEncoding(buffer);
  
  // Convert to string
  const content = buffer.toString(detectedEncoding);
  
  // Remove BOM if present
  const cleanContent = content.replace(/^\uFEFF/, '');
  
  const result = extractFromString(cleanContent, opts);
  
  return {
    ...result,
    encoding: detectedEncoding,
    fileType: getFileType(filePath),
  };
}

/**
 * Extract specific line range from content
 */
export function extractLineRange(
  content: string,
  startLine: number,
  endLine: number,
  options: ExtractionOptions = {}
): ExtractionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const rawLines = content.split(/\r?\n/);
  const lines: ExtractedLine[] = [];
  
  // Adjust for 1-indexed line numbers
  const start = Math.max(1, startLine);
  const end = Math.min(rawLines.length, endLine);
  
  for (let i = start - 1; i < end; i++) {
    const rawLine = rawLines[i];
    const processedContent = opts.trimLines ? rawLine.trim() : rawLine;
    const isEmpty = processedContent.length === 0;
    
    if (opts.skipEmptyLines && isEmpty) continue;
    
    lines.push({
      lineNumber: i + 1,
      content: processedContent,
      isEmpty,
    });
  }
  
  const extractedContent = lines.map(l => l.content).join('\n');
  
  return {
    content: extractedContent,
    lines,
    lineCount: lines.length,
    characterCount: extractedContent.length,
    wordCount: countWords(extractedContent),
    encoding: opts.encoding,
    fileType: 'text',
  };
}

/**
 * Search for pattern in extracted content
 */
export function searchInContent(
  result: ExtractionResult,
  pattern: string | RegExp
): Array<{ lineNumber: number; content: string; matches: string[] }> {
  const regex = typeof pattern === 'string' 
    ? new RegExp(pattern, 'gi')
    : pattern;
  
  const matches: Array<{ lineNumber: number; content: string; matches: string[] }> = [];
  
  for (const line of result.lines) {
    const lineMatches = line.content.match(regex);
    if (lineMatches) {
      matches.push({
        lineNumber: line.lineNumber,
        content: line.content,
        matches: lineMatches,
      });
    }
  }
  
  return matches;
}

/**
 * Format extracted content with line numbers
 */
export function formatWithLineNumbers(
  result: ExtractionResult,
  options: { padding?: number; separator?: string } = {}
): string {
  const { padding = 4, separator = ' | ' } = options;
  
  return result.lines
    .map(line => {
      const lineNum = line.lineNumber.toString().padStart(padding, ' ');
      return `${lineNum}${separator}${line.content}`;
    })
    .join('\n');
}
