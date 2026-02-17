import { useState } from "react"
import { 
  Filter, 
  Folder, 
  Calendar,
  FileText,
  ChevronDown,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ScopeType = 'all' | 'path' | 'moc' | 'tag'
export type ContentType = 'all' | 'items' | 'sources' | 'entities'

export interface SearchFilters {
  scope: ScopeType
  scopeValue?: string
  contentType: ContentType
  dateFrom?: string
  dateTo?: string
}

interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  availablePaths?: string[]
  availableMocs?: string[]
  availableTags?: string[]
}

interface FilterButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors",
        active 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted hover:bg-accent"
      )}
    >
      {children}
    </button>
  )
}

interface DropdownSelectProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
}

function DropdownSelect({ value, options, onChange, placeholder }: DropdownSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md bg-muted border-0",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        !value && "text-muted-foreground"
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function SearchFiltersPanel({
  filters,
  onFiltersChange,
  availablePaths = [],
  availableMocs = [],
  availableTags = [],
}: SearchFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const updateFilter = <K extends keyof SearchFilters>(
    key: K, 
    value: SearchFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  const clearFilters = () => {
    onFiltersChange({
      scope: 'all',
      scopeValue: undefined,
      contentType: 'all',
      dateFrom: undefined,
      dateTo: undefined,
    })
  }

  const hasActiveFilters = 
    filters.scope !== 'all' || 
    filters.contentType !== 'all' || 
    filters.dateFrom || 
    filters.dateTo

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              Active
            </span>
          )}
          <ChevronDown className={cn(
            "h-4 w-4 transition-transform",
            isExpanded && "rotate-180"
          )} />
        </button>
        
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Folder className="h-4 w-4" />
              Scope
            </label>
            <div className="flex flex-wrap gap-2">
              <FilterButton 
                active={filters.scope === 'all'} 
                onClick={() => updateFilter('scope', 'all')}
              >
                All
              </FilterButton>
              <FilterButton 
                active={filters.scope === 'path'} 
                onClick={() => updateFilter('scope', 'path')}
              >
                Path
              </FilterButton>
              <FilterButton 
                active={filters.scope === 'moc'} 
                onClick={() => updateFilter('scope', 'moc')}
              >
                MOC
              </FilterButton>
              <FilterButton 
                active={filters.scope === 'tag'} 
                onClick={() => updateFilter('scope', 'tag')}
              >
                Tag
              </FilterButton>
            </div>
            
            {filters.scope === 'path' && availablePaths.length > 0 && (
              <div className="mt-2">
                <DropdownSelect
                  value={filters.scopeValue || ''}
                  options={availablePaths.map(p => ({ value: p, label: p }))}
                  onChange={(v) => updateFilter('scopeValue', v)}
                  placeholder="Select path..."
                />
              </div>
            )}
            
            {filters.scope === 'moc' && availableMocs.length > 0 && (
              <div className="mt-2">
                <DropdownSelect
                  value={filters.scopeValue || ''}
                  options={availableMocs.map(m => ({ value: m, label: m }))}
                  onChange={(v) => updateFilter('scopeValue', v)}
                  placeholder="Select MOC..."
                />
              </div>
            )}
            
            {filters.scope === 'tag' && availableTags.length > 0 && (
              <div className="mt-2">
                <DropdownSelect
                  value={filters.scopeValue || ''}
                  options={availableTags.map(t => ({ value: t, label: `#${t}` }))}
                  onChange={(v) => updateFilter('scopeValue', v)}
                  placeholder="Select tag..."
                />
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <FileText className="h-4 w-4" />
              Content Type
            </label>
            <div className="flex flex-wrap gap-2">
              <FilterButton 
                active={filters.contentType === 'all'} 
                onClick={() => updateFilter('contentType', 'all')}
              >
                All
              </FilterButton>
              <FilterButton 
                active={filters.contentType === 'items'} 
                onClick={() => updateFilter('contentType', 'items')}
              >
                Items
              </FilterButton>
              <FilterButton 
                active={filters.contentType === 'sources'} 
                onClick={() => updateFilter('contentType', 'sources')}
              >
                Sources
              </FilterButton>
              <FilterButton 
                active={filters.contentType === 'entities'} 
                onClick={() => updateFilter('contentType', 'entities')}
              >
                Entities
              </FilterButton>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Calendar className="h-4 w-4" />
              Date Range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
                className="px-3 py-1.5 text-sm rounded-md bg-muted border-0 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
                className="px-3 py-1.5 text-sm rounded-md bg-muted border-0 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
