import { useState } from 'react'
import styles from './SetupPage.module.css'

export default function SetupPage({ onComplete }) {
  const [token,   setToken]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/setup/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Connection failed. Please try again.')
      } else {
        onComplete()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.logo}>◈</div>
        <h1 className={styles.heading}>Connect to Monarch Money</h1>
        <p className={styles.tagline}>Stashtrend — your self-hosted finance dashboard</p>

        <ol className={styles.steps}>
          <li>Log in to <strong>app.monarchmoney.com</strong></li>
          <li>Open DevTools: <code>Cmd⌥I</code> (Mac) or <code>F12</code> (Windows)</li>
          <li>Click the <strong>Network</strong> tab, then reload the page</li>
          <li>Click any request to <code>api.monarchmoney.com</code></li>
          <li>Under <strong>Headers</strong>, find <code>Authorization: Token xxxxxx</code></li>
          <li>Copy everything <em>after</em> <code>Token </code></li>
        </ol>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="token-input" className={styles.label}>
            Monarch API Token
          </label>
          <input
            id="token-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token here"
            className={styles.input}
            autoComplete="off"
            required
          />
          {error && <div className={styles.error}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className={styles.btn}
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  )
}
