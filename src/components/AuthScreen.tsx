import type { FormEvent } from 'react'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import './AuthScreen.css'

export function AuthScreen() {
  const { signIn, signUp, requestPasswordReset } = useAuth()
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (mode === 'register' && password !== confirm) {
      setMessage(t.authPasswordMismatch)
      return
    }
    if (password.length < 6) {
      setMessage(t.authPasswordMin)
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) setMessage(error)
      } else {
        const { error } = await signUp(email, password)
        if (error) setMessage(error)
        else setMessage(t.authSignupSuccess)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleForgotPassword = async () => {
    setMessage(null)
    if (!email.trim()) {
      setMessage(t.authResetEmailRequired)
      return
    }
    setBusy(true)
    try {
      const { error } = await requestPasswordReset(email)
      if (error) setMessage(error)
      else setMessage(t.authResetSent)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__head">
          <h1 className="auth__title">{t.appTitle}</h1>
          <LanguageSwitcher className="auth__lang" />
        </div>
        <p className="auth__subtitle">
          {mode === 'login' ? t.authSubtitleLogin : t.authSubtitleRegister}
        </p>

        <form className="auth__form" onSubmit={submit}>
          <label className="auth__label">
            {t.authEmail}
            <input
              className="auth__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="auth__label">
            {t.authPassword}
            <input
              className="auth__input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {mode === 'register' && (
            <label className="auth__label">
              {t.authConfirmPassword}
              <input
                className="auth__input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
            </label>
          )}

          {message && <p className="auth__message">{message}</p>}

          <button type="submit" className="auth__submit" disabled={busy}>
            {busy ? t.authBusy : mode === 'login' ? t.authSubmitLogin : t.authSubmitRegister}
          </button>
          {mode === 'login' && (
            <button type="button" className="auth__forgot" onClick={() => void handleForgotPassword()} disabled={busy}>
              {t.authForgotPassword}
            </button>
          )}
        </form>

        <button
          type="button"
          className="auth__toggle"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'))
            setMessage(null)
          }}
        >
          {mode === 'login' ? t.authToggleToRegister : t.authToggleToLogin}
        </button>
      </div>
    </div>
  )
}
