import { useEffect, useState } from 'react'
import styles from './AIAnalysisPanel.module.css'

export default function AIAnalysisPanel() {
  const [expanded,  setExpanded]  = useState(false)
  const [config,    setConfig]    = useState(null)   // null=loading, object=loaded
  const [status,    setStatus]    = useState('idle') // idle | running | done
  const [analysis,  setAnalysis]  = useState('')
  const [error,     setError]     = useState('')

  // Config form state (shown when unconfigured)
  const [provider, setProvider] = useState('anthropic')
  const [apiKey,   setApiKey]   = useState('')
  const [model,    setModel]    = useState('')
  const [baseUrl,  setBaseUrl]  = useState('')

  // Fetch AI config on mount
  useEffect(() => {
    fetch('/api/ai/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false }))
  }, [])

  async function runAnalysis() {
    setStatus('running')
    setAnalysis('')
    setError('')
    try {
      const res = await fetch('/api/ai/analyze', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setAnalysis(data.analysis ?? '')
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  async function handleSaveAndAnalyze(e) {
    e.preventDefault()
    setError('')
    try {
      const body = { provider, api_key: apiKey, model, base_url: baseUrl }
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setConfig(data)
      await runAnalysis()
    } catch (err) {
      setError(err.message)
    }
  }

  function handleReconfigure() {
    setConfig(prev => ({ ...prev, configured: false }))
    setStatus('idle')
    setAnalysis('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.panel}>
      {/* Header / toggle */}
      <button
        className={styles.header}
        onClick={() => setExpanded(o => !o)}
        aria-expanded={expanded}
      >
        <span className={styles.headerTitle}>✦ Analyze with AI</span>
        <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className={styles.body}>
          {/* ── Running ── */}
          {status === 'running' && (
            <div className={styles.runningRow}>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Analyzing your budget data…</span>
            </div>
          )}

          {/* ── Done ── */}
          {status === 'done' && (
            <>
              <pre className={styles.analysisText}>{analysis}</pre>
              <div className={styles.actionRow}>
                <button className={styles.btnPrimary} onClick={runAnalysis}>
                  Re-run
                </button>
                <button className={styles.btnGhost} onClick={handleReconfigure}>
                  Reconfigure
                </button>
              </div>
            </>
          )}

          {/* ── Idle: configured ── */}
          {status === 'idle' && config?.configured && (
            <div className={styles.configuredView}>
              <div className={styles.badges}>
                <span className={styles.badge}>{config.provider}</span>
                <span className={styles.badge}>{config.model}</span>
              </div>
              <div className={styles.actionRow}>
                <button className={styles.btnPrimary} onClick={runAnalysis}>
                  Run Analysis
                </button>
                <button className={styles.btnGhost} onClick={handleReconfigure}>
                  Reconfigure
                </button>
              </div>
            </div>
          )}

          {/* ── Idle: unconfigured ── */}
          {status === 'idle' && config && !config.configured && (
            <form className={styles.configForm} onSubmit={handleSaveAndAnalyze}>
              <div className={styles.formRow}>
                <label htmlFor="ai-provider" className={styles.label}>Provider</label>
                <select
                  id="ai-provider"
                  className={styles.input}
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                  aria-label="Provider"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai_compatible">OpenAI Compatible</option>
                </select>
              </div>
              <div className={styles.formRow}>
                <label htmlFor="ai-api-key" className={styles.label}>API Key</label>
                <input
                  id="ai-api-key"
                  type="password"
                  className={styles.input}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  required
                  aria-label="API Key"
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="ai-model" className={styles.label}>Model</label>
                <input
                  id="ai-model"
                  type="text"
                  className={styles.input}
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="e.g. claude-opus-4-5"
                  required
                  aria-label="Model"
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="ai-base-url" className={styles.label}>
                  Base URL <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id="ai-base-url"
                  type="url"
                  className={styles.input}
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  aria-label="Base URL"
                />
              </div>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <button type="submit" className={styles.btnPrimary}>
                Save &amp; Analyze
              </button>
            </form>
          )}

          {/* ── Config still loading ── */}
          {status === 'idle' && !config && (
            <div className={styles.loadingMsg}>Loading…</div>
          )}

          {error && status !== 'idle' && (
            <div className={styles.errorMsg}>{error}</div>
          )}
        </div>
      )}
    </div>
  )
}
