/**
 * ChatGPT export type definitions
 * Based on the conversations.json format from ChatGPT data exports
 */

import { z } from 'zod';

/**
 * Author role in a conversation
 */
export const AuthorRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type AuthorRole = z.infer<typeof AuthorRoleSchema>;

/**
 * Author information
 */
export const AuthorSchema = z.object({
  role: AuthorRoleSchema,
  name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Author = z.infer<typeof AuthorSchema>;

/**
 * Content part - can be text or other types
 */
export const ContentPartSchema = z.union([
  z.string(),
  z.object({
    content_type: z.string(),
    text: z.string().optional(),
    asset_pointer: z.string().optional(),
    size_bytes: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
]);
export type ContentPart = z.infer<typeof ContentPartSchema>;

/**
 * Message content
 */
export const ContentSchema = z.object({
  content_type: z.string(),
  parts: z.array(ContentPartSchema).optional(),
  text: z.string().optional(),
});
export type Content = z.infer<typeof ContentSchema>;

/**
 * Message metadata
 */
export const MessageMetadataSchema = z.object({
  timestamp_: z.string().optional(),
  message_type: z.string().nullable().optional(),
  model_slug: z.string().optional(),
  default_model_slug: z.string().optional(),
  parent_id: z.string().optional(),
  finish_details: z.object({
    type: z.string(),
    stop_tokens: z.array(z.number()).optional(),
  }).optional(),
  is_complete: z.boolean().optional(),
  citations: z.array(z.unknown()).optional(),
  gizmo_id: z.string().nullable().optional(),
  request_id: z.string().optional(),
  voice_mode_message: z.boolean().optional(),
}).passthrough();
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

/**
 * A single message in a conversation
 */
export const MessageSchema = z.object({
  id: z.string(),
  author: AuthorSchema,
  create_time: z.number().nullable().optional(),
  update_time: z.number().nullable().optional(),
  content: ContentSchema.nullable().optional(),
  status: z.string().optional(),
  end_turn: z.boolean().nullable().optional(),
  weight: z.number().optional(),
  metadata: MessageMetadataSchema.optional(),
  recipient: z.string().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

/**
 * Mapping entry - contains message and children
 */
export const MappingEntrySchema = z.object({
  id: z.string(),
  message: MessageSchema.nullable().optional(),
  parent: z.string().nullable().optional(),
  children: z.array(z.string()),
});
export type MappingEntry = z.infer<typeof MappingEntrySchema>;

/**
 * Conversation mapping - ID to entry
 */
export const MappingSchema = z.record(z.string(), MappingEntrySchema);
export type Mapping = z.infer<typeof MappingSchema>;

/**
 * A complete ChatGPT conversation
 */
export const ConversationSchema = z.object({
  title: z.string(),
  create_time: z.number(),
  update_time: z.number(),
  mapping: MappingSchema,
  moderation_results: z.array(z.unknown()).optional(),
  current_node: z.string().optional(),
  plugin_ids: z.array(z.string()).nullable().optional(),
  conversation_id: z.string().optional(),
  conversation_template_id: z.string().nullable().optional(),
  gizmo_id: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
  safe_urls: z.array(z.string()).optional(),
  default_model_slug: z.string().optional(),
  id: z.string().optional(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * ChatGPT export file - array of conversations
 */
export const ChatGPTExportSchema = z.array(ConversationSchema);
export type ChatGPTExport = z.infer<typeof ChatGPTExportSchema>;
