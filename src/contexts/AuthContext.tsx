import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function hasRecoveryTokenInUrl(): boolean {
  const hash = window.location.hash
  const search = window.location.search
  return hash.includes('type=recovery') || search.includes('type=recovery')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [passwordRecovery, setPasswordRecovery] = useState(hasRecoveryTokenInUrl)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }

    sb.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session ?? null)
        if (hasRecoveryTokenInUrl()) setPasswordRecovery(true)
      })
      .finally(() => setLoading(false))

    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY' || hasRecoveryTokenInUrl()) {
        setPasswordRecovery(true)
      }
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase()
    if (!sb) return { error: 'Supabase não está configurado.' }
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    return { error: error ? error.message : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const sb = getSupabase()
    if (!sb) return { error: 'Supabase não está configurado.' }
    const { error } = await sb.auth.signUp({ email: email.trim(), password })
    return { error: error ? error.message : null }
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const sb = getSupabase()
    if (!sb) return { error: 'Supabase não está configurado.' }
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    return { error: error ? error.message : null }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const sb = getSupabase()
    if (!sb) return { error: 'Supabase não está configurado.' }
    const { error } = await sb.auth.updateUser({ password })
    if (!error) {
      setPasswordRecovery(false)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    return { error: error ? error.message : null }
  }, [])

  const signOut = useCallback(async () => {
    const sb = getSupabase()
    if (!sb) return
    await sb.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      passwordRecovery,
      signIn,
      signUp,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [session, loading, passwordRecovery, signIn, signUp, requestPasswordReset, updatePassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth tem de estar dentro de AuthProvider')
  return ctx
}
