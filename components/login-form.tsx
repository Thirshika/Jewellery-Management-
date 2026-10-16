'use client'

import { useState } from 'react'
import { LockKeyhole, UserRound } from 'lucide-react'
import { LanguageSwitch, useLanguage } from '@/lib/language'

export function LoginForm() {
  const { t } = useLanguage()
  const [isSignup, setIsSignup] = useState(false)
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, identifier, password }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? (isSignup ? 'Sign-up failed.' : 'Sign-in failed.'))
      window.location.assign('/')
    } catch (caught) {
      setError(t(caught instanceof Error ? caught.message : isSignup ? 'Sign-up failed. Please try again.' : 'Sign-in failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-language-switch"><LanguageSwitch /></div>
      <section className="login-card">
        <div className="login-card-content">
          <h1>{t(isSignup ? 'Create your account' : 'Welcome back')}<span>.</span></h1>
          <p className="subheading">{t(isSignup ? 'Create an account to open your own workshop workspace.' : 'Sign in to open your workshop diary.')}</p>
          <form className="order-form" onSubmit={submit}>
            {isSignup && (
              <label className="form-field">
                <span>{t('Your name')}</span>
                <div className="password-field">
                  <UserRound size={16} />
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    autoFocus
                    required
                    maxLength={80}
                    placeholder={t('Your name')}
                  />
                </div>
              </label>
            )}
            <label className="form-field">
              <span>{t('Email or phone number')}</span>
              <div className="password-field">
                <UserRound size={16} />
                <input
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete="username"
                  autoFocus={!isSignup}
                  required
                  maxLength={254}
                  placeholder={t('Email or phone number')}
                />
              </div>
              {isSignup && <small className="form-hint">{t('Use a valid email address or phone number. Indian 10-digit numbers are supported.')}</small>}
            </label>
            <label className="form-field">
              <span>{t('Password')}</span>
              <div className="password-field">
                <LockKeyhole size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  minLength={isSignup ? 12 : 1}
                  maxLength={256}
                />
              </div>
              {isSignup && <small className="form-hint">{t('Use at least 12 characters.')}</small>}
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" type="submit" disabled={loading}>
              {loading
                ? t(isSignup ? 'Creating account…' : 'Signing in…')
                : t(isSignup ? 'Create account' : 'Sign in')}
            </button>
          </form>
          <p className="auth-switch">
            {t(isSignup ? 'Already have an account?' : 'New to Kanthimathi?')}
            {' '}
            <button type="button" onClick={() => { setIsSignup((value) => !value); setError('') }}>
              {t(isSignup ? 'Sign in' : 'Sign up')}
            </button>
          </p>
          <p className="auth-shared-note">{t('Each account has its own private workspace.')}</p>
        </div>
      </section>
    </main>
  )
}
