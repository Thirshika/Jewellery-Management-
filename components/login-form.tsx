'use client'

import { useState } from 'react'
import { Gem, LockKeyhole } from 'lucide-react'

export function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Sign-in failed.')
      window.location.assign('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark login-mark"><Gem size={19} /></div>
        <p className="eyebrow">SUVARNA · GOLDSMITH STUDIO</p>
        <h1>Welcome back<span>.</span></h1>
        <p className="subheading">Sign in to open your workshop diary.</p>
        <form className="order-form" onSubmit={signIn}>
          <label className="form-field">
            <span>Admin password</span>
            <div className="password-field">
              <LockKeyhole size={16} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                maxLength={256}
              />
            </div>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
