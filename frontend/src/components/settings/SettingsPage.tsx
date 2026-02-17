import { useState } from "react"
import { 
  Settings,
  Folder,
  Brain,
  Key,
  Save,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SettingsState {
  vaultPath: string
  modelProvider: 'openai' | 'anthropic' | 'local'
  modelName: string
  apiKey: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const modelOptions = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
  local: ['llama-3', 'mistral-7b', 'codellama'],
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    vaultPath: '/Users/New/Desktop/Wilco OS',
    modelProvider: 'anthropic',
    modelName: 'claude-3-sonnet',
    apiKey: '',
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaveStatus('saving')
    setError(null)

    try {
      const response = await fetch('http://localhost:3001/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      setSaveStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const updateSetting = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaveStatus('idle')
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Folder className="h-4 w-4" />
          <h2>Vault Configuration</h2>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Vault Path</label>
          <input
            type="text"
            value={settings.vaultPath}
            onChange={(e) => updateSetting('vaultPath', e.target.value)}
            placeholder="/path/to/obsidian/vault"
            className={cn(
              "w-full px-3 py-2 rounded-md border border-border",
              "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            )}
          />
          <p className="text-xs text-muted-foreground">
            Path to your Obsidian vault root directory
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Brain className="h-4 w-4" />
          <h2>Model Selection</h2>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Provider</label>
            <select
              value={settings.modelProvider}
              onChange={(e) => {
                const provider = e.target.value as SettingsState['modelProvider']
                updateSetting('modelProvider', provider)
                updateSetting('modelName', modelOptions[provider][0])
              }}
              className={cn(
                "w-full px-3 py-2 rounded-md border border-border",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="local">Local</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Model</label>
            <select
              value={settings.modelName}
              onChange={(e) => updateSetting('modelName', e.target.value)}
              className={cn(
                "w-full px-3 py-2 rounded-md border border-border",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            >
              {modelOptions[settings.modelProvider].map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Key className="h-4 w-4" />
          <h2>API Key Management</h2>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            {settings.modelProvider === 'openai' ? 'OpenAI' : 
             settings.modelProvider === 'anthropic' ? 'Anthropic' : 'Local'} API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
              placeholder={settings.modelProvider === 'local' ? 'Not required for local models' : 'sk-...'}
              disabled={settings.modelProvider === 'local'}
              className={cn(
                "w-full px-3 py-2 pr-10 rounded-md border border-border",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            />
            {settings.modelProvider !== 'local' && (
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            API keys are stored securely and never logged
          </p>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-border">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {saveStatus === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
          {saveStatus === 'saved' && <Check className="h-4 w-4" />}
          {saveStatus === 'idle' && <Save className="h-4 w-4" />}
          {saveStatus === 'error' && <AlertCircle className="h-4 w-4" />}
          <span>
            {saveStatus === 'saving' ? 'Saving...' : 
             saveStatus === 'saved' ? 'Saved!' : 
             saveStatus === 'error' ? 'Retry' : 'Save Settings'}
          </span>
        </button>
      </div>
    </div>
  )
}
