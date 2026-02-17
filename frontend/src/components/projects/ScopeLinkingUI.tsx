import { useState } from "react"
import { 
  Link2,
  Map,
  Folder,
  Tag,
  X,
  Plus,
  Search,
  Loader2,
  Check
} from "lucide-react"
import { cn } from "@/lib/utils"

type ScopeType = 'moc' | 'path' | 'tag'

export interface ScopeLink {
  id: string
  type: ScopeType
  value: string
  label?: string
}

interface ScopeLinkingUIProps {
  links: ScopeLink[]
  availableMOCs?: { id: string; name: string; path: string }[]
  availableTags?: string[]
  isLoading?: boolean
  onAddLink: (type: ScopeType, value: string) => Promise<void>
  onRemoveLink: (linkId: string) => Promise<void>
}

const scopeTypes: { id: ScopeType; label: string; icon: typeof Map; placeholder: string }[] = [
  { id: 'moc', label: 'MOC', icon: Map, placeholder: 'Select a Map of Content' },
  { id: 'path', label: 'Path', icon: Folder, placeholder: 'e.g., 30_Projects/Brain' },
  { id: 'tag', label: 'Tag', icon: Tag, placeholder: 'e.g., #project/active' },
]

function ScopeBadge({ 
  link, 
  onRemove 
}: { 
  link: ScopeLink
  onRemove: () => void 
}) {
  const typeConfig = scopeTypes.find(t => t.id === link.type)
  const Icon = typeConfig?.icon || Link2

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full",
      "bg-muted border border-border text-sm"
    )}>
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="truncate max-w-[200px]">{link.label || link.value}</span>
      <button
        onClick={onRemove}
        className="p-0.5 rounded hover:bg-background"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function AddScopeForm({
  type,
  availableMOCs,
  availableTags,
  onAdd,
  onCancel,
}: {
  type: ScopeType
  availableMOCs?: { id: string; name: string; path: string }[]
  availableTags?: string[]
  onAdd: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [search, setSearch] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const typeConfig = scopeTypes.find(t => t.id === type)

  const handleAdd = async () => {
    if (!value.trim()) return
    setIsAdding(true)
    try {
      await onAdd(value.trim())
      setValue('')
    } finally {
      setIsAdding(false)
    }
  }

  const filteredMOCs = availableMOCs?.filter(moc =>
    moc.name.toLowerCase().includes(search.toLowerCase())
  ) || []

  const filteredTags = availableTags?.filter(tag =>
    tag.toLowerCase().includes(search.toLowerCase())
  ) || []

  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Add {typeConfig?.label}</span>
        <button onClick={onCancel} className="p-1 rounded hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {type === 'moc' && availableMOCs && availableMOCs.length > 0 ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search MOCs..."
              className={cn(
                "w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            />
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filteredMOCs.map((moc) => (
              <button
                key={moc.id}
                onClick={() => setValue(moc.path)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left",
                  value === moc.path ? "bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                <Map className="h-4 w-4" />
                <span className="flex-1 truncate">{moc.name}</span>
                {value === moc.path && <Check className="h-4 w-4" />}
              </button>
            ))}
            {filteredMOCs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No MOCs found</p>
            )}
          </div>
        </div>
      ) : type === 'tag' && availableTags && availableTags.length > 0 ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or enter tag..."
              className={cn(
                "w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            />
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {filteredTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setValue(tag)}
                className={cn(
                  "px-2 py-1 text-xs rounded-full",
                  value === tag 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted hover:bg-accent"
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
          {search && !availableTags.includes(search) && (
            <button
              onClick={() => setValue(search)}
              className="text-xs text-primary hover:underline"
            >
              Use "{search}" as new tag
            </button>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={typeConfig?.placeholder}
          className={cn(
            "w-full px-3 py-2 text-sm rounded-md border border-border",
            "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        />
      )}

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!value.trim() || isAdding}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add
        </button>
      </div>
    </div>
  )
}

export function ScopeLinkingUI({
  links,
  availableMOCs,
  availableTags,
  isLoading,
  onAddLink,
  onRemoveLink,
}: ScopeLinkingUIProps) {
  const [addingType, setAddingType] = useState<ScopeType | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleRemove = async (linkId: string) => {
    setRemovingId(linkId)
    try {
      await onRemoveLink(linkId)
    } finally {
      setRemovingId(null)
    }
  }

  const mocLinks = links.filter(l => l.type === 'moc')
  const pathLinks = links.filter(l => l.type === 'path')
  const tagLinks = links.filter(l => l.type === 'tag')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-medium">Scope Links</h3>
      </div>

      {scopeTypes.map((type) => {
        const Icon = type.icon
        const typeLinks = type.id === 'moc' ? mocLinks : type.id === 'path' ? pathLinks : tagLinks

        return (
          <div key={type.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{type.label}s</span>
                <span className="text-muted-foreground">({typeLinks.length})</span>
              </div>
              {addingType !== type.id && (
                <button
                  onClick={() => setAddingType(type.id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Add {type.label}
                </button>
              )}
            </div>

            {typeLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {typeLinks.map((link) => (
                  <div key={link.id} className={cn(removingId === link.id && "opacity-50")}>
                    <ScopeBadge
                      link={link}
                      onRemove={() => handleRemove(link.id)}
                    />
                  </div>
                ))}
              </div>
            )}

            {typeLinks.length === 0 && addingType !== type.id && (
              <p className="text-xs text-muted-foreground">No {type.label.toLowerCase()}s linked</p>
            )}

            {addingType === type.id && (
              <AddScopeForm
                type={type.id}
                availableMOCs={availableMOCs}
                availableTags={availableTags}
                onAdd={async (value) => {
                  await onAddLink(type.id, value)
                  setAddingType(null)
                }}
                onCancel={() => setAddingType(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
