import { useState, useCallback } from "react"
import { 
  Upload, 
  FileJson, 
  Folder, 
  MessageSquare,
  X,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ImportType = 'chatgpt' | 'claude' | 'folder' | 'json'

interface FileDropZoneProps {
  onFilesSelected: (files: File[], type: ImportType) => void
  selectedType: ImportType | null
  onTypeChange: (type: ImportType) => void
}

const importTypes = [
  { 
    id: 'chatgpt' as const, 
    label: 'ChatGPT', 
    icon: MessageSquare, 
    accept: '.json',
    description: 'conversations.json export'
  },
  { 
    id: 'claude' as const, 
    label: 'Claude', 
    icon: MessageSquare, 
    accept: '.json',
    description: 'conversations.json export'
  },
  { 
    id: 'folder' as const, 
    label: 'Folder', 
    icon: Folder, 
    accept: '',
    description: 'Markdown or text files'
  },
  { 
    id: 'json' as const, 
    label: 'JSON', 
    icon: FileJson, 
    accept: '.json',
    description: 'Generic JSON data'
  },
]

export function FileDropZone({ 
  onFilesSelected, 
  selectedType, 
  onTypeChange 
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  const validateFiles = useCallback((files: File[], type: ImportType): string | null => {
    if (files.length === 0) {
      return 'No files selected'
    }

    const typeConfig = importTypes.find(t => t.id === type)
    if (!typeConfig) return 'Invalid import type'

    if (typeConfig.accept) {
      const invalidFiles = files.filter(f => !f.name.endsWith(typeConfig.accept))
      if (invalidFiles.length > 0) {
        return `Invalid file format. Expected ${typeConfig.accept} files.`
      }
    }

    if (type === 'chatgpt' || type === 'claude') {
      if (files.length !== 1) {
        return 'Please select exactly one conversations.json file'
      }
    }

    return null
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (!selectedType) {
      setError('Please select an import type first')
      return
    }

    const files = Array.from(e.dataTransfer.files)
    const validationError = validateFiles(files, selectedType)
    
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSelectedFiles(files)
    onFilesSelected(files, selectedType)
  }, [selectedType, validateFiles, onFilesSelected])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedType) {
      setError('Please select an import type first')
      return
    }

    const files = Array.from(e.target.files || [])
    const validationError = validateFiles(files, selectedType)
    
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSelectedFiles(files)
    onFilesSelected(files, selectedType)
  }, [selectedType, validateFiles, onFilesSelected])

  const clearSelection = () => {
    setSelectedFiles([])
    setError(null)
  }

  const currentTypeConfig = importTypes.find(t => t.id === selectedType)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-3">Select Import Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {importTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => {
                onTypeChange(type.id)
                setSelectedFiles([])
                setError(null)
              }}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                selectedType === type.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              )}
            >
              <type.icon className="h-6 w-6" />
              <span className="text-sm font-medium">{type.label}</span>
              <span className="text-xs text-muted-foreground text-center">
                {type.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">Select Files</h3>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border",
            !selectedType && "opacity-50 cursor-not-allowed"
          )}
        >
          {selectedFiles.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-green-600">
                <FileJson className="h-8 w-8" />
              </div>
              <div>
                <p className="font-medium">{selectedFiles.length} file(s) selected</p>
                <ul className="text-sm text-muted-foreground mt-2">
                  {selectedFiles.map((f, i) => (
                    <li key={i}>{f.name}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={clearSelection}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop files here, or click to browse
              </p>
              {currentTypeConfig && (
                <p className="text-xs text-muted-foreground">
                  Accepts: {currentTypeConfig.accept || 'all files'}
                </p>
              )}
              <input
                type="file"
                onChange={handleFileInput}
                accept={currentTypeConfig?.accept}
                multiple={selectedType === 'folder'}
                disabled={!selectedType}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
