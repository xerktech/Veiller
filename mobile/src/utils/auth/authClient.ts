import {AsyncResult, result as Res, Result} from "typesafe-ts"

import {MentraAuthSession, MentraAuthUser, MentraSigninResponse} from "@/utils/auth/authProvider.types"

/**
 * Foverlay: auth removed. This is a dedicated local app — no login, no account
 * creation, no cloud identity. `mentraAuth` is a fixed local stub so the few
 * remaining consumers (MantleManager's engine.configure, settings screens)
 * keep working without a backend:
 *   - getUser/getSession      → the fixed local identity
 *   - getSubjectToken         → a dummy token (so engine.configure never throws;
 *                               the socket simply won't authenticate against a
 *                               server we don't run, which is fine for local use)
 *   - onAuthStateChange       → a no-op subscription with a real unsubscribe
 *   - signOut/auto-refresh    → no-ops
 * Every other method (signup/login/reset/OAuth) is unreachable now that the
 * auth screens are gone; they return an error Result rather than throwing.
 *
 * The AuthClient abstract shape is kept so the type surface is unchanged for
 * consumers; the real providers (accountClient/authingClient) are removed.
 */

const LOCAL_USER: MentraAuthUser = {
  id: "local-user",
  email: "local@foverlay.app",
  name: "Local",
}

const LOCAL_SESSION: MentraAuthSession = {
  token: "local",
  user: LOCAL_USER,
}

export abstract class AuthClient {
  public onAuthStateChange(_callback: (event: string, session: MentraAuthSession) => void): Result<any, Error> {
    return Res.error(new Error("Method not implemented"))
  }
  public getUser(): AsyncResult<MentraAuthUser, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public signUp(_params: {email: string; password: string}): AsyncResult<MentraSigninResponse, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public resendSignupEmail(_email: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public signInWithPassword(_params: {email: string; password: string}): AsyncResult<MentraSigninResponse, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public resetPasswordForEmail(_email: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public resetPasswordByCode(_email: string, _code: string, _newPassword: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public updateUserPassword(_password: string, _currentPassword?: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public updateUserEmail(_email: string, _password?: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public confirmEmailChange(_code: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public requestAccountDeletion(): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public confirmAccountDeletion(_code: string): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public getSession(): AsyncResult<MentraAuthSession, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public updateSessionWithTokens(_tokens: {access_token: string; refresh_token: string}): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public startAutoRefresh(): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public stopAutoRefresh(): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public signOut(): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public appleSignIn(): AsyncResult<string, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public googleSignIn(): AsyncResult<string, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public getSubjectToken(): AsyncResult<{token: string; type: string}, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
  public completeOAuthHandoff(_params: {code: string; state: string}): AsyncResult<void, Error> {
    return Res.error_async(new Error("Method not implemented"))
  }
}

/** Foverlay's no-auth local client. */
class LocalAuthClient extends AuthClient {
  public override onAuthStateChange(_callback: (event: string, session: MentraAuthSession) => void): Result<any, Error> {
    // Never fires — there is no auth state to change.
    return Res.ok({unsubscribe: () => {}})
  }
  public override getUser(): AsyncResult<MentraAuthUser, Error> {
    return Res.ok_async(LOCAL_USER)
  }
  public override getSession(): AsyncResult<MentraAuthSession, Error> {
    return Res.ok_async(LOCAL_SESSION)
  }
  public override getSubjectToken(): AsyncResult<{token: string; type: string}, Error> {
    return Res.ok_async({token: "local", type: "mentra"})
  }
  public override signOut(): AsyncResult<void, Error> {
    return Res.ok_async(undefined)
  }
  public override startAutoRefresh(): AsyncResult<void, Error> {
    return Res.ok_async(undefined)
  }
  public override stopAutoRefresh(): AsyncResult<void, Error> {
    return Res.ok_async(undefined)
  }
}

const mentraAuth: AuthClient = new LocalAuthClient()
export default mentraAuth
