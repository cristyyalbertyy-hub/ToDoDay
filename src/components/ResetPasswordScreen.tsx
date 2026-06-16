import type { FormEvent } from 'react'
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import './AuthScreen.css'

export function ResetPasswordScreen() {
  const { updatePassword } = useAuth()
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (password !== confirm) {
      setMessage(t.authPasswordMismatch)
      return
    }
    if (password.length < 6) {
      setMessage(t.authPasswordMin)
      return
    }
    setBusy(true)
    try {
      const { error } = await updatePassword(password)
      if (error) setMessage(error)
      else {
        setDone(true)
        setMessage(t.authResetSuccess)
      }
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
        <p className="auth__subtitle">{t.authResetSubtitle}</p>

        <form className="auth__form" onSubmit={submit}>
          <label className="auth__label">
            {t.authNewPassword}
            <input
              className="auth__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={done}
            />
          </label>
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
              disabled={done}
            />
          </label>

          {message && <p className="auth__message">{message}</p>}

          {!done && (
            <button type="submit" className="auth__submit" disabled={busy}>
              {busy ? t.authBusy : t.authResetSubmit}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
