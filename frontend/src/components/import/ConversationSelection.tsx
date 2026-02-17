import { useState, useMemo } from "react"
import { 
  Check, 
  Square, 
  CheckSquare,
  MessageSquare,
  ChevronRight,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ParsedConversation } from "./ParsingProgress"

interface ConversationSelectionProps {
  conversations: ParsedConversation[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onPreview?: (conversation: ParsedConversation) => void
}

interface ConversationRowProps {
  conversation: ParsedConversation
  isSelected: boolean
  onToggle: () => void
  onPreview?: () => void
}

function ConversationRow({ 
  conversation, 
  isSelected, 
  onToggle, 
  onPreview 
}: ConversationRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        isSelected 
          ? "border-primary bg-primary/5" 
          : "border-border hover:bg-accent/50"
      )}
    >
      <button
        onClick={onToggle}
        className="shrink-0 focus:outline-none focus:ring-2 focus:ring-ring rounded"
      >
        {isSelected ? (
          <CheckSquare className="h-5 w-5 text-primary" />
        ) : (
          <Square className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{conversation.title}</p>
        <p className="text-xs text-muted-foreground">
          {conversation.messageCount} messages
          {conversation.createdAt && (
            <> • {new Date(conversation.createdAt).toLocaleDateString()}</>
          )}
        </p>
      </div>

      {onPreview && (
        <button
          onClick={onPreview}
          className="shrink-0 p-2 rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

interface PreviewPanelProps {
  conversation: ParsedConversation
  onClose: () => void
}

function PreviewPanel({ conversation, onClose }: PreviewPanelProps) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium">{conversation.title}</h4>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="text-sm text-muted-foreground space-y-2">
        <p><strong>Messages:</strong> {conversation.messageCount}</p>
        {conversation.createdAt && (
          <p><strong>Created:</strong> {new Date(conversation.createdAt).toLocaleString()}</p>
        )}
        <p className="text-xs mt-4 italic">
          Full preview will be available after import
        </p>
      </div>
    </div>
  )
}

export function ConversationSelection({
  conversations,
  selectedIds,
  onSelectionChange,
  onPreview,
}: ConversationSelectionProps) {
  const [previewConversation, setPreviewConversation] = useState<ParsedConversation | null>(null)

  const allSelected = useMemo(() => 
    conversations.length > 0 && selectedIds.size === conversations.length,
    [conversations.length, selectedIds.size]
  )


  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(conversations.map(c => c.id)))
    }
  }

  const toggleOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    onSelectionChange(newSet)
  }

  const handlePreview = (conversation: ParsedConversation) => {
    setPreviewConversation(conversation)
    onPreview?.(conversation)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Select Conversations</h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} of {conversations.length} selected
          </span>
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            {allSelected ? (
              <>
                <Square className="h-4 w-4" />
                Deselect All
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Select All
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No conversations to display
            </p>
          ) : (
            conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedIds.has(conversation.id)}
                onToggle={() => toggleOne(conversation.id)}
                onPreview={() => handlePreview(conversation)}
              />
            ))
          )}
        </div>

        {previewConversation && (
          <PreviewPanel
            conversation={previewConversation}
            onClose={() => setPreviewConversation(null)}
          />
        )}
      </div>
    </div>
  )
}
