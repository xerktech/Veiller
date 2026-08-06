export type VeillerAuthUser = {
  id: string
  email?: string
  name: string
  phoneNumber?: string
  avatarUrl?: string
  createdAt?: string
  provider?: string
}

export type VeillerAuthStateChangeSubscriptionResponse = {
  data: {
    subscription: any
  } | null
  error: {
    message: string
  } | null
}

export type VeillerAuthSession = {
  token?: string
  user?: VeillerAuthUser
}

export type VeillerAuthSessionResponse = {
  data: {
    session: VeillerAuthSession | null
  } | null
  error: {
    message: string
  } | null
}

export type VeillerAuthUserResponse = {
  data: {
    user: VeillerAuthUser | null
  } | null
  error: {
    message: string
  } | null
}

export type VeillerSignOutResponse = {
  error: {
    message: string
  } | null
}

export type VeillerUpdateUserPasswordResponse = {
  data: {} | null
  error: {
    message: string
  } | null
}

export type VeillerPasswordResetResponse = {
  data: {} | null
  error: {
    message: string
  } | null
}

export type VeillerOauthProviderResponse = {
  data: {
    url?: string
  } | null
  error: {
    message: string
  } | null
}

export type VeillerSigninResponse = {
  data: {
    session: VeillerAuthSession | null
    user: VeillerAuthUser | null
  } | null
  error: {
    message: string
  } | null
}
