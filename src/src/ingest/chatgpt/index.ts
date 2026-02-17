/**
 * ChatGPT ingestion module
 * Parses and processes ChatGPT JSON exports
 */

export {
  parseChatGPTExport,
  parseChatGPTExportFile,
  validateConversation,
  getConversationStats,
  type ParsedMessage,
  type ParsedConversation,
  type ParseResult,
  type ParseError,
} from './parser.js';

export {
  ChatGPTExportSchema,
  ConversationSchema,
  MessageSchema,
  AuthorSchema,
  AuthorRoleSchema,
  type ChatGPTExport,
  type Conversation,
  type Message,
  type Author,
  type AuthorRole,
  type Mapping,
  type MappingEntry,
} from './types.js';

export {
  CHATGPT_DIRS,
  ensureDirectoryStructure,
  generateTimestampedFilename,
  storeRawFile,
  storeParsedJsonl,
  storeMarkdownFiles,
  importChatGPTExport,
  getStorageStats,
  type ImportOptions,
  type ImportResult,
} from './storage.js';

export {
  createTempDir,
  cleanupTempDir,
  extractZip,
  findConversationsJson,
  isZipFile,
  extractAndFindConversations,
  getZipStats,
  type ExtractionResult,
  type ExtractedFile,
} from './zip.js';
