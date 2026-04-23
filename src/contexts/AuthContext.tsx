import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)

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
      })
      .finally(() => setLoading(false))

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next)
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
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth tem de estar dentro de AuthProvider')
  return ctx
}
