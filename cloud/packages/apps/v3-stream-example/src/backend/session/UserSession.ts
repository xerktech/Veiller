import type { VeillerSession } from "@veiller/sdk";
import { StreamManager } from "./StreamManager";
import { StateManager } from "../state/StateManager";

/**
 * Per-user state for the stream test app.
 * Static methods manage the session store — no separate SessionManager class.
 */
export class UserSession {
  private static sessions = new Map<string, UserSession>();

  readonly userId: string;
  readonly stream: StreamManager;
  readonly state: StateManager;
  private session: VeillerSession | null = null;

  private constructor(userId: string) {
    this.userId = userId;
    this.state = new StateManager();
    this.stream = new StreamManager(this.state);
  }

  // ─── Static store ────────────────────────────────────────────────────────

  static getOrCreate(userId: string): UserSession {
    let userSession = UserSession.sessions.get(userId);
    if (!userSession) {
      userSession = new UserSession(userId);
      UserSession.sessions.set(userId, userSession);
    }
    return userSession;
  }

  static get(userId: string): UserSession | undefined {
    return UserSession.sessions.get(userId);
  }

  static remove(userId: string): void {
    const userSession = UserSession.sessions.get(userId);
    if (userSession) {
      userSession.stream.detachSession();
    }
    UserSession.sessions.delete(userId);
  }

  // ─── Session lifecycle ───────────────────────────────────────────────────

  attachSession(session: VeillerSession): void {
    this.session = session;
    this.stream.attachSession(session);
  }

  detachSession(): void {
    this.stream.detachSession();
    this.session = null;
  }

  get appSession(): VeillerSession | null {
    return this.session;
  }

  hasActiveSession(): boolean {
    return this.session !== null;
  }
}
