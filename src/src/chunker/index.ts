/**
 * Text chunker module
 * Splits text into chunks with line number mapping for retrieval
 */

/**
 * A chunk of text with position information
 */
export interface Chunk {
  index: number;
  content: string;
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
  charCount: number;
}

/**
 * Chunking options
 */
export interface ChunkOptions {
  minChunkSize?: number;
  maxChunkSize?: number;
  overlapSize?: number;
  splitOn?: 'paragraph' | 'sentence' | 'line' | 'char';
}

/**
 * Default chunking options
 */
const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  minChunkSize: 800,
  maxChunkSize: 1500,
  overlapSize: 100,
  splitOn: 'paragraph',
};

/**
 * Line information for mapping
 */
interface LineInfo {
  lineNumber: number;
  startChar: number;
  endChar: number;
  content: string;
}

/**
 * Build line index from content
 */
function buildLineIndex(content: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let charPos = 0;
  
  const rawLines = content.split('\n');
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    lines.push({
      lineNumber: i + 1,
      startChar: charPos,
      endChar: charPos + line.length,
      content: line,
    });
    charPos += line.length + 1; // +1 for newline
  }
  
  return lines;
}

/**
 * Find line number for a character position
 */
function findLineForChar(lineIndex: LineInfo[], charPos: number): number {
  for (const line of lineIndex) {
    if (charPos >= line.startChar && charPos <= line.endChar) {
      return line.lineNumber;
    }
  }
  // Return last line if past end
  return lineIndex.length > 0 ? lineIndex[lineIndex.length - 1].lineNumber : 1;
}

/**
 * Split text into paragraphs (double newline separated)
 */
function splitIntoParagraphs(content: string): string[] {
  return content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
}

/**
 * Split text into sentences
 */
function splitIntoSentences(content: string): string[] {
  // Split on sentence-ending punctuation followed by space or newline
  return content
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);
}

/**
 * Split text into lines
 */
function splitIntoLines(content: string): string[] {
  return content.split('\n').filter(l => l.trim().length > 0);
}

/**
 * Get segments based on split strategy
 */
function getSegments(content: string, splitOn: ChunkOptions['splitOn']): string[] {
  switch (splitOn) {
    case 'paragraph':
      return splitIntoParagraphs(content);
    case 'sentence':
      return splitIntoSentences(content);
    case 'line':
      return splitIntoLines(content);
    case 'char':
    default:
      // Return content as single segment for char-based splitting
      return [content];
  }
}

/**
 * Create chunks from segments with size constraints
 */
function createChunksFromSegments(
  segments: string[],
  content: string,
  lineIndex: LineInfo[],
  options: Required<ChunkOptions>
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let chunkStartChar = 0;
  let segmentStartChar = 0;
  
  // Track position in original content
  let searchPos = 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Find segment position in original content
    const segmentPos = content.indexOf(segment, searchPos);
    if (segmentPos === -1) continue;
    searchPos = segmentPos + segment.length;
    
    // Check if adding this segment exceeds max size
    const potentialChunk = currentChunk 
      ? currentChunk + '\n\n' + segment 
      : segment;
    
    if (potentialChunk.length > options.maxChunkSize && currentChunk.length >= options.minChunkSize) {
      // Save current chunk
      const chunkEndChar = segmentStartChar > 0 ? segmentStartChar - 1 : chunkStartChar + currentChunk.length;
      
      chunks.push({
        index: chunks.length,
        content: currentChunk,
        startLine: findLineForChar(lineIndex, chunkStartChar),
        endLine: findLineForChar(lineIndex, chunkEndChar),
        startChar: chunkStartChar,
        endChar: chunkEndChar,
        charCount: currentChunk.length,
      });
      
      // Start new chunk with overlap
      const overlapStart = Math.max(0, currentChunk.length - options.overlapSize);
      const overlap = currentChunk.slice(overlapStart);
      currentChunk = overlap + '\n\n' + segment;
      chunkStartChar = chunkEndChar - overlap.length;
    } else {
      // Add segment to current chunk
      if (currentChunk.length === 0) {
        chunkStartChar = segmentPos;
      }
      currentChunk = potentialChunk;
    }
    
    segmentStartChar = segmentPos + segment.length;
  }
  
  // Add final chunk if it has content
  if (currentChunk.trim().length > 0) {
    const chunkEndChar = content.length - 1;
    
    chunks.push({
      index: chunks.length,
      content: currentChunk,
      startLine: findLineForChar(lineIndex, chunkStartChar),
      endLine: findLineForChar(lineIndex, chunkEndChar),
      startChar: chunkStartChar,
      endChar: chunkEndChar,
      charCount: currentChunk.length,
    });
  }
  
  return chunks;
}

/**
 * Create chunks using character-based splitting
 */
function createCharChunks(
  content: string,
  lineIndex: LineInfo[],
  options: Required<ChunkOptions>
): Chunk[] {
  const chunks: Chunk[] = [];
  let pos = 0;
  
  while (pos < content.length) {
    // Calculate chunk end position
    let endPos = Math.min(pos + options.maxChunkSize, content.length);
    
    // Try to break at a natural boundary (newline, space, punctuation)
    if (endPos < content.length) {
      const searchStart = Math.max(pos + options.minChunkSize, endPos - 100);
      let breakPos = -1;
      
      // Look for paragraph break first
      const paraBreak = content.lastIndexOf('\n\n', endPos);
      if (paraBreak >= searchStart) {
        breakPos = paraBreak + 2;
      }
      
      // Then sentence break
      if (breakPos === -1) {
        const sentenceEnd = content.slice(searchStart, endPos).search(/[.!?]\s/);
        if (sentenceEnd !== -1) {
          breakPos = searchStart + sentenceEnd + 2;
        }
      }
      
      // Then line break
      if (breakPos === -1) {
        const lineBreak = content.lastIndexOf('\n', endPos);
        if (lineBreak >= searchStart) {
          breakPos = lineBreak + 1;
        }
      }
      
      // Then word break
      if (breakPos === -1) {
        const spacePos = content.lastIndexOf(' ', endPos);
        if (spacePos >= searchStart) {
          breakPos = spacePos + 1;
        }
      }
      
      if (breakPos !== -1) {
        endPos = breakPos;
      }
    }
    
    const chunkContent = content.slice(pos, endPos).trim();
    
    if (chunkContent.length > 0) {
      chunks.push({
        index: chunks.length,
        content: chunkContent,
        startLine: findLineForChar(lineIndex, pos),
        endLine: findLineForChar(lineIndex, endPos - 1),
        startChar: pos,
        endChar: endPos - 1,
        charCount: chunkContent.length,
      });
    }
    
    // Move position with overlap
    pos = Math.max(pos + 1, endPos - options.overlapSize);
  }
  
  return chunks;
}

/**
 * Chunk text content with line number mapping
 */
export function chunkText(content: string, options: ChunkOptions = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!content || content.trim().length === 0) {
    return [];
  }
  
  const lineIndex = buildLineIndex(content);
  
  // If content is small enough, return as single chunk
  if (content.length <= opts.maxChunkSize) {
    return [{
      index: 0,
      content: content.trim(),
      startLine: 1,
      endLine: lineIndex.length,
      startChar: 0,
      endChar: content.length - 1,
      charCount: content.trim().length,
    }];
  }
  
  // Use character-based chunking for 'char' mode
  if (opts.splitOn === 'char') {
    return createCharChunks(content, lineIndex, opts);
  }
  
  // Get segments based on split strategy
  const segments = getSegments(content, opts.splitOn);
  
  // If no segments found, fall back to char-based
  if (segments.length === 0) {
    return createCharChunks(content, lineIndex, opts);
  }
  
  return createChunksFromSegments(segments, content, lineIndex, opts);
}

/**
 * Chunk markdown content (preserves code blocks)
 */
export function chunkMarkdown(content: string, options: ChunkOptions = {}): Chunk[] {
  // For markdown, prefer paragraph splitting
  return chunkText(content, { splitOn: 'paragraph', ...options });
}

/**
 * Chunk code content (preserves function boundaries when possible)
 */
export function chunkCode(content: string, options: ChunkOptions = {}): Chunk[] {
  // For code, prefer line splitting with larger chunks
  return chunkText(content, { 
    splitOn: 'line',
    minChunkSize: 500,
    maxChunkSize: 2000,
    ...options 
  });
}

/**
 * Chunk conversation content (preserves message boundaries)
 */
export function chunkConversation(content: string, options: ChunkOptions = {}): Chunk[] {
  // For conversations, prefer paragraph splitting (messages)
  return chunkText(content, { splitOn: 'paragraph', ...options });
}

/**
 * Get chunk statistics
 */
export function getChunkStats(chunks: Chunk[]): ChunkStats {
  if (chunks.length === 0) {
    return {
      count: 0,
      totalChars: 0,
      avgChunkSize: 0,
      minChunkSize: 0,
      maxChunkSize: 0,
      totalLines: 0,
    };
  }
  
  const sizes = chunks.map(c => c.charCount);
  const totalChars = sizes.reduce((a, b) => a + b, 0);
  const totalLines = chunks[chunks.length - 1].endLine;
  
  return {
    count: chunks.length,
    totalChars,
    avgChunkSize: Math.round(totalChars / chunks.length),
    minChunkSize: Math.min(...sizes),
    maxChunkSize: Math.max(...sizes),
    totalLines,
  };
}

/**
 * Chunk statistics
 */
export interface ChunkStats {
  count: number;
  totalChars: number;
  avgChunkSize: number;
  minChunkSize: number;
  maxChunkSize: number;
  totalLines: number;
}
