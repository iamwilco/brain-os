/**
 * ChatGPT JSON export parser
 * Parses conversations.json files from ChatGPT data exports
 */

import { readFile } from 'fs/promises';
import {
  ChatGPTExportSchema,
  ConversationSchema,
  type Conversation,
  type Message,
  type MappingEntry,
  type AuthorRole,
} from './types.js';

/**
 * Parsed message with flattened metadata
 */
export interface ParsedMessage {
  id: string;
  role: AuthorRole;
  content: string;
  createTime: Date | null;
  updateTime: Date | null;
  model: string | null;
  isComplete: boolean;
  parentId: string | null;
}

/**
 * Parsed conversation with messages in order
 */
export interface ParsedConversation {
  id: string;
  title: string;
  createTime: Date;
  updateTime: Date;
  model: string | null;
  messageCount: number;
  messages: ParsedMessage[];
  isArchived: boolean;
  gizmoId: string | null;
}

/**
 * Parse result with statistics
 */
export interface ParseResult {
  conversations: ParsedConversation[];
  totalMessages: number;
  parseErrors: ParseError[];
}

/**
 * Parse error information
 */
export interface ParseError {
  conversationIndex?: number;
  conversationTitle?: string;
  error: string;
}

/**
 * Extract text content from a message
 */
function extractMessageContent(message: Message | null | undefined): string {
  if (!message?.content) return '';
  
  const content = message.content;
  
  // Handle text content type
  if (content.text) {
    return content.text;
  }
  
  // Handle parts array
  if (content.parts && Array.isArray(content.parts)) {
    return content.parts
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part.text) return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  
  return '';
}

/**
 * Convert Unix timestamp to Date
 */
function timestampToDate(timestamp: number | null | undefined): Date | null {
  if (timestamp == null) return null;
  return new Date(timestamp * 1000);
}

/**
 * Build ordered message list from conversation mapping
 * Traverses the tree structure to get messages in conversation order
 */
function buildMessageList(mapping: Record<string, MappingEntry>): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  
  // Find root node (has no parent or parent is null)
  let rootId: string | null = null;
  for (const [id, entry] of Object.entries(mapping)) {
    if (entry.parent === null || entry.parent === undefined) {
      rootId = id;
      break;
    }
  }
  
  if (!rootId) {
    // Fallback: find node that isn't anyone's child
    const allChildren = new Set<string>();
    for (const entry of Object.values(mapping)) {
      for (const childId of entry.children) {
        allChildren.add(childId);
      }
    }
    for (const id of Object.keys(mapping)) {
      if (!allChildren.has(id)) {
        rootId = id;
        break;
      }
    }
  }
  
  if (!rootId) return messages;
  
  // BFS through the tree following first child (main conversation path)
  const visited = new Set<string>();
  const queue: string[] = [rootId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    const entry = mapping[currentId];
    if (!entry) continue;
    
    // Add message if it exists and has content
    if (entry.message) {
      const msg = entry.message;
      const content = extractMessageContent(msg);
      
      // Only include messages with actual content
      if (content.trim() || msg.author.role === 'system') {
        messages.push({
          id: msg.id,
          role: msg.author.role,
          content: content,
          createTime: timestampToDate(msg.create_time),
          updateTime: timestampToDate(msg.update_time),
          model: msg.metadata?.model_slug || null,
          isComplete: msg.metadata?.is_complete ?? true,
          parentId: entry.parent || null,
        });
      }
    }
    
    // Add children to queue (follow main conversation path - first child)
    if (entry.children.length > 0) {
      // Add first child to front (main path)
      queue.unshift(entry.children[0]);
    }
  }
  
  return messages;
}

/**
 * Parse a single conversation
 */
function parseConversation(conv: Conversation, index: number): ParsedConversation | ParseError {
  try {
    const messages = buildMessageList(conv.mapping);
    
    // Get model from first assistant message
    const model = messages.find(m => m.role === 'assistant')?.model || 
                  conv.default_model_slug || 
                  null;
    
    return {
      id: conv.conversation_id || conv.id || `conv-${index}`,
      title: conv.title || 'Untitled',
      createTime: new Date(conv.create_time * 1000),
      updateTime: new Date(conv.update_time * 1000),
      model,
      messageCount: messages.length,
      messages,
      isArchived: conv.is_archived ?? false,
      gizmoId: conv.gizmo_id || null,
    };
  } catch (err) {
    return {
      conversationIndex: index,
      conversationTitle: conv.title,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Parse ChatGPT export JSON string
 */
export function parseChatGPTExport(jsonContent: string): ParseResult {
  const conversations: ParsedConversation[] = [];
  const parseErrors: ParseError[] = [];
  let totalMessages = 0;
  
  // Parse JSON
  let rawData: unknown;
  try {
    rawData = JSON.parse(jsonContent);
  } catch (err) {
    return {
      conversations: [],
      totalMessages: 0,
      parseErrors: [{
        error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
  
  // Validate against schema
  const validationResult = ChatGPTExportSchema.safeParse(rawData);
  if (!validationResult.success) {
    return {
      conversations: [],
      totalMessages: 0,
      parseErrors: [{
        error: `Schema validation failed: ${validationResult.error.message}`,
      }],
    };
  }
  
  const exportData = validationResult.data;
  
  // Parse each conversation
  for (let i = 0; i < exportData.length; i++) {
    const result = parseConversation(exportData[i], i);
    
    if ('error' in result) {
      parseErrors.push(result);
    } else {
      conversations.push(result);
      totalMessages += result.messageCount;
    }
  }
  
  return {
    conversations,
    totalMessages,
    parseErrors,
  };
}

/**
 * Parse ChatGPT export from file path
 */
export async function parseChatGPTExportFile(filePath: string): Promise<ParseResult> {
  const content = await readFile(filePath, 'utf-8');
  return parseChatGPTExport(content);
}

/**
 * Validate a single conversation object
 */
export function validateConversation(data: unknown): Conversation | null {
  const result = ConversationSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Get conversation statistics
 */
export function getConversationStats(conv: ParsedConversation) {
  const userMessages = conv.messages.filter(m => m.role === 'user');
  const assistantMessages = conv.messages.filter(m => m.role === 'assistant');
  const systemMessages = conv.messages.filter(m => m.role === 'system');
  
  const totalChars = conv.messages.reduce((sum, m) => sum + m.content.length, 0);
  const avgMessageLength = conv.messages.length > 0 
    ? Math.round(totalChars / conv.messages.length) 
    : 0;
  
  return {
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    systemMessageCount: systemMessages.length,
    totalCharacters: totalChars,
    averageMessageLength: avgMessageLength,
    durationMs: conv.updateTime.getTime() - conv.createTime.getTime(),
  };
}
