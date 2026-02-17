import { useState, useCallback, useRef } from 'react'
import { Upload, File, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { projectsApi } from '../../lib/api'
import type { FileUploadResponse } from '../../lib/api'

interface FileUploadZoneProps {
  projectId: string
  onUploadComplete?: (result: FileUploadResponse) => void
}

const ALLOWED_EXTENSIONS = ['.md', '.txt', '.pdf', '.json', '.csv']

export function FileUploadZone({ projectId, onUploadComplete }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<FileUploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleUpload = useCallback(async (files: File[]) => {
    setIsUploading(true)
    setProgress(0)
    setResult(null)
    setError(null)

    try {
      const response = await projectsApi.uploadFiles(projectId, files, setProgress)
      setResult(response)
      onUploadComplete?.(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [projectId, onUploadComplete])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleUpload(files)
    }
  }, [handleUpload])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      handleUpload(files)
    }
  }, [handleUpload])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const resetState = () => {
    setResult(null)
    setError(null)
    setProgress(0)
  }

  return (
    <div className="space-y-4">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging 
            ? 'border-blue-500 bg-blue-500/10' 
            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'
          }
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div className="space-y-3">
            <Loader2 className="w-10 h-10 mx-auto text-blue-400 animate-spin" />
            <p className="text-sm text-zinc-400">Uploading... {progress}%</p>
            <div className="w-full max-w-xs mx-auto bg-zinc-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="w-10 h-10 mx-auto text-zinc-500" />
            <div>
              <p className="text-sm text-zinc-300">
                Drop files here or <span className="text-blue-400">browse</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Supported: {ALLOWED_EXTENSIONS.join(', ')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-2 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-zinc-300">Upload Results</h4>
            <button 
              onClick={resetState}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          </div>

          {result.uploaded.length > 0 && (
            <div className="space-y-1">
              {result.uploaded.map((filename) => (
                <div key={filename} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <File className="w-4 h-4 text-zinc-500" />
                  <span className="text-zinc-300">{filename}</span>
                </div>
              ))}
            </div>
          )}

          {result.failed.length > 0 && (
            <div className="space-y-1 mt-2">
              {result.failed.map(({ filename, error }) => (
                <div key={filename} className="flex items-start gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
                  <div>
                    <span className="text-zinc-300">{filename}</span>
                    <p className="text-xs text-red-400">{error}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
