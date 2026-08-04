import {FC, createContext, useContext} from "react"

import {MentraAuthSession, MentraAuthUser} from "@/utils/auth/authProvider.types"

/**
 * Foverlay: auth removed. This is a dedicated local app for the G2 glasses +
 * Tap Strap — there is no login or account creation. `useAuth()` returns a
 * fixed local identity so the entry gate (src/app/index.tsx) flows straight
 * into onboarding/home and the engine starts, and every downstream consumer
 * (MantleManager, settings screens) keeps a stable user/session to read.
 *
 * The keep-the-shape approach (vs. deleting the context) means the ~dozen
 * consumers of useAuth()/mentraAuth compile and run unchanged. The auth
 * screens and provider internals are removed separately.
 */

interface AuthContextProps {
  user: MentraAuthUser | null
  session: MentraAuthSession | null
  loading: boolean
  logout: () => void
}

const LOCAL_USER: MentraAuthUser = {
  id: "local-user",
  email: "local@foverlay.app",
  name: "Local",
} as MentraAuthUser

const LOCAL_SESSION: MentraAuthSession = {
  token: "local",
  user: LOCAL_USER,
} as MentraAuthSession

const AuthContext = createContext<AuthContextProps>({
  user: LOCAL_USER,
  session: LOCAL_SESSION,
  loading: false,
  logout: () => {},
})

export const AuthProvider: FC<{children: React.ReactNode}> = ({children}) => {
  // No auth: constant local identity, never loading.
  const value: AuthContextProps = {
    user: LOCAL_USER,
    session: LOCAL_SESSION,
    loading: false,
    logout: () => {},
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
