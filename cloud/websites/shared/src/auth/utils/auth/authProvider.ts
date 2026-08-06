import {AuthingWrapperClient} from "./provider/authingClient"
import {SupabaseWrapperClient} from "./provider/supabaseClient"
import {
  VeillerAuthSessionResponse,
  VeillerAuthStateChangeSubscriptionResponse,
  VeillerOauthProviderResponse,
  VeillerPasswordResetResponse,
  VeillerSigninResponse,
  VeillerSignOutResponse,
} from "./authingProvider.types"

const DEPLOYMENT_REGION = import.meta.env.VITE_DEPLOYMENT_REGION || "global"
const IS_CHINA = DEPLOYMENT_REGION === "china"

class VeillerAuthProvider {
  constructor() {
    this.supabaseClient = new SupabaseWrapperClient()
    this.authingClient = new AuthingWrapperClient()
  }

  private supabaseClient: SupabaseWrapperClient
  private authingClient: AuthingWrapperClient

  async getSession(): Promise<VeillerAuthSessionResponse> {
    if (IS_CHINA) {
      return this.authingClient.getSession()
    } else {
      return this.supabaseClient.getSession()
    }
  }

  async signInWithEmail(email: string, password: string): Promise<VeillerSigninResponse> {
    if (IS_CHINA) {
      return this.authingClient.signInWithEmail(email, password)
    } else {
      return this.supabaseClient.signInWithEmail(email, password)
    }
  }

  async signOut(): Promise<VeillerSignOutResponse> {
    if (IS_CHINA) {
      return this.authingClient.signOut()
    } else {
      return this.supabaseClient.signOut()
    }
  }

  async signUpWithEmail(email: string, password: string, redirectTo?: string): Promise<VeillerSigninResponse> {
    if (IS_CHINA) {
      return this.authingClient.signUpWithEmail(email, password, redirectTo)
    } else {
      return this.supabaseClient.signUpWithEmail(email, password, redirectTo)
    }
  }

  onAuthStateChange(callback: (event: string, session: any) => void): VeillerAuthStateChangeSubscriptionResponse {
    if (IS_CHINA) {
      return this.authingClient.onAuthStateChange(callback)
    } else {
      return this.supabaseClient.onAuthStateChange(callback)
    }
  }

  async resetPasswordForEmail(email: string, redirectTo?: string): Promise<VeillerPasswordResetResponse> {
    if (IS_CHINA) {
      throw new Error("Method not implemented.")
    } else {
      return this.supabaseClient.resetPasswordForEmail(email, redirectTo)
    }
  }

  async refreshUser(): Promise<VeillerAuthSessionResponse> {
    if (IS_CHINA) {
      throw new Error("Method not implemented.")
    } else {
      return this.supabaseClient.refreshUser()
    }
  }

  async appleSignIn(redirectTo?: string): Promise<VeillerOauthProviderResponse> {
    if (IS_CHINA) {
      throw new Error("Apple sign in not supported in China")
    } else {
      return this.supabaseClient.appleSignIn(redirectTo)
    }
  }

  async googleSignIn(redirectTo?: string): Promise<VeillerOauthProviderResponse> {
    if (IS_CHINA) {
      throw new Error("Google sign in not supported in China")
    } else {
      return this.supabaseClient.googleSignIn(redirectTo)
    }
  }
}

export const mentraAuthProvider = new VeillerAuthProvider()
