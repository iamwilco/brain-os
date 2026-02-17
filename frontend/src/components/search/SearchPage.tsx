import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/useDebounce"
import { searchApi, type SearchResult } from "@/lib/api"

interface SearchPageProps {
  onSearch?: (query: string) => Promise<void>
  isLoading?: boolean
  children?: React.ReactNode
}

export function SearchPage({ onSearch, isLoading: externalLoading, children }: SearchPageProps) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 300)

  const handleSearch = useCallback(async (q: string) => {
    if (onSearch) {
      await onSearch(q)
      return
    }
    setSearching(true)
    try {
      const response = await searchApi.search(q)
      setResults(response.results)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [onSearch])

  const isLoading = externalLoading || searching

  useEffect(() => {
    if (debouncedQuery.trim()) {
      handleSearch(debouncedQuery)
    } else {
      setResults([])
    }
  }, [debouncedQuery, handleSearch])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const clearQuery = () => {
    setQuery("")
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge base..."
          className={cn(
            "w-full pl-12 pr-20 py-4 text-lg",
            "bg-card border border-border rounded-lg",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
            "transition-all"
          )}
        />
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center gap-2">
          {query && (
            <button
              onClick={clearQuery}
              className="p-1 rounded hover:bg-accent"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-muted text-muted-foreground rounded">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{results.length} results</p>
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className="p-4 bg-card border border-border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <h3 className="font-medium">{result.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{result.snippet}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span className="px-2 py-0.5 bg-muted rounded">{result.type}</span>
                  <span>Score: {result.score.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {query && !isLoading && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No results found for "{query}"</p>
        </div>
      )}

      {children}
    </div>
  )
}
