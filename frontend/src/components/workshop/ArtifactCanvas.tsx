import { useState, useRef, useEffect } from "react"
import { 
  FileText,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface Artifact {
  id: string
  version: number
  content: string
  title?: string
  createdAt: string
  type?: 'markdown' | 'code' | 'text'
}

interface ArtifactCanvasProps {
  artifacts: Artifact[]
  isLoading?: boolean
  onVersionChange?: (artifactId: string, version: number) => void
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) {
          return <h1 key={i} className="text-xl font-bold mt-4 mb-2">{line.slice(2)}</h1>
        }
        if (line.startsWith('## ')) {
          return <h2 key={i} className="text-lg font-semibold mt-3 mb-2">{line.slice(3)}</h2>
        }
        if (line.startsWith('### ')) {
          return <h3 key={i} className="text-base font-medium mt-2 mb-1">{line.slice(4)}</h3>
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <li key={i} className="ml-4">{line.slice(2)}</li>
        }
        if (line.startsWith('```')) {
          return null
        }
        if (line.trim() === '') {
          return <div key={i} className="h-2" />
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote key={i} className="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground">
              {line.slice(2)}
            </blockquote>
          )
        }
        return <p key={i} className="my-1">{line}</p>
      })}
    </div>
  )
}

function ArtifactCard({ 
  artifact, 
  totalVersions,
  onVersionChange 
}: { 
  artifact: Artifact
  totalVersions: number
  onVersionChange?: (version: number) => void 
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canGoPrev = artifact.version > 1
  const canGoNext = artifact.version < totalVersions

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            {artifact.title || 'Artifact'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {totalVersions > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onVersionChange?.(artifact.version - 1)}
                disabled={!canGoPrev}
                className={cn(
                  "p-1 rounded hover:bg-accent",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="text-xs text-muted-foreground px-1">
                v{artifact.version}/{totalVersions}
              </span>
              <button
                onClick={() => onVersionChange?.(artifact.version + 1)}
                disabled={!canGoNext}
                className={cn(
                  "p-1 rounded hover:bg-accent",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
          
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-accent"
            title="Copy content"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
      
      <div className="p-4 max-h-96 overflow-y-auto">
        {artifact.type === 'code' ? (
          <pre className="text-sm font-mono bg-muted p-3 rounded overflow-x-auto">
            {artifact.content}
          </pre>
        ) : (
          <MarkdownRenderer content={artifact.content} />
        )}
      </div>
      
      <div className="flex items-center gap-2 px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>{new Date(artifact.createdAt).toLocaleString()}</span>
      </div>
    </div>
  )
}

export function ArtifactCanvas({
  artifacts,
  isLoading,
  onVersionChange,
}: ArtifactCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [artifactVersions, setArtifactVersions] = useState<Record<string, number>>({})

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [artifacts.length])

  const groupedArtifacts = artifacts.reduce((acc, artifact) => {
    const baseId = artifact.id.split('-v')[0]
    if (!acc[baseId]) {
      acc[baseId] = []
    }
    acc[baseId].push(artifact)
    return acc
  }, {} as Record<string, Artifact[]>)

  const getDisplayedArtifact = (baseId: string, versions: Artifact[]) => {
    const selectedVersion = artifactVersions[baseId] || versions.length
    return versions.find(a => a.version === selectedVersion) || versions[versions.length - 1]
  }

  const handleVersionChange = (baseId: string, version: number) => {
    setArtifactVersions(prev => ({ ...prev, [baseId]: version }))
    const artifact = groupedArtifacts[baseId]?.find(a => a.version === version)
    if (artifact) {
      onVersionChange?.(artifact.id, version)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No artifacts yet</p>
        <p className="text-xs mt-1">Artifacts created by skills will appear here</p>
      </div>
    )
  }

  return (
    <div 
      ref={scrollRef}
      className="h-full overflow-y-auto p-4 space-y-4"
    >
      {Object.entries(groupedArtifacts).map(([baseId, versions]) => {
        const displayedArtifact = getDisplayedArtifact(baseId, versions)
        return (
          <ArtifactCard
            key={baseId}
            artifact={displayedArtifact}
            totalVersions={versions.length}
            onVersionChange={(v) => handleVersionChange(baseId, v)}
          />
        )
      })}
    </div>
  )
}
