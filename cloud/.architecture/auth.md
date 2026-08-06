# Veiller Webview Authentication — End-to-End

How a user opening a mini app's webview on their phone gets authenticated all the way through to the developer's frontend code — without ever entering a username or password.

---

## Table of Contents

- [Overview](#overview)
- [The Players](#the-players)
- [Two Auth Paths](#two-auth-paths)
- [Path A: Mobile App Webview (Automatic)](#path-a-mobile-app-webview-automatic)
  - [Step 1: Mobile App Opens Webview](#step-1-mobile-app-opens-webview)
  - [Step 2: React SDK Picks Up Tokens](#step-2-react-sdk-picks-up-tokens)
  - [Step 3: Token Exchange with App Backend](#step-3-token-exchange-with-app-backend)
  - [Step 4: Session Established](#step-4-session-established)
- [Path B: Browser OAuth via `/veiller-auth`](#path-b-browser-oauth-via-veiller-auth)
  - [How It Works](#how-the-browser-oauth-flow-works)
  - [Browser OAuth Sequence Diagram](#browser-oauth-sequence-diagram)
  - [Adding "Sign in with Veiller" to Your App](#adding-sign-in-with-veiller-to-your-app)
- [Token Types](#token-types)
- [Auth Routes in the SDK](#auth-routes-in-the-sdk)
- [React SDK (`@veiller/react`)](#react-sdk-veillerreact)
- [Making Authenticated API Calls](#making-authenticated-api-calls)
- [How the userId Reaches the Developer](#how-the-userid-reaches-the-developer)
- [Key Insight: No Manual User ID Entry](#key-insight-no-manual-user-id-entry)
- [Sequence Diagram](#sequence-diagram)
- [File Map](#file-map)
- [Common Mistakes](#common-mistakes)

---

## Overview

Veiller webview auth is **zero-login**. There are two paths to authentication, but both end the same way: the developer calls `useVeillerAuth()` and gets back a `userId` and `frontendToken` — no login page, no manual ID entry.

- **Path A (Mobile App):** The user is already logged in on the Veiller phone app. When they tap a mini app's webview, the phone app generates cryptographic tokens and appends them to the URL. Fully automatic.

- **Path B (Browser):** The user opens the webview directly in a desktop or mobile browser (not inside the Veiller app). They click "Sign in with Veiller" which redirects to `account.mentra.glass`, they log in, and get redirected back with tokens. The SDK's built-in `/veiller-auth` endpoint handles the redirect.

Both paths feed into the same `@veiller/react` auth flow — the developer's code doesn't need to know which path was used.

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  PATH A: Mobile App                PATH B: Browser               │
│  ─────────────────                 ───────────────               │
│  Phone app appends tokens          User clicks "Sign in with     │
│  to webview URL automatically      Veiller" → /veiller-auth →      │
│                                    account.mentra.glass login →   │
│                                    redirect back with tokens      │
│         │                                    │                   │
│         └────────────────┬───────────────────┘                   │
│                          ▼                                       │
│               @veiller/react picks up tokens                      │
│               Verifies JWT + exchanges temp token                │
│               Sets session cookie                                │
│                          ▼                                       │
│          const { userId } = useVeillerAuth()  ← done              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## The Players

| Component | Package / Path | Role |
|-----------|---------------|------|
| **Veiller Phone App** | `mobile/src/app/applet/webview.tsx` | Generates tokens, opens webview with auth params |
| **Veiller Cloud** | `cloud/packages/cloud/src/api/hono/routes/auth.routes.ts` | Issues temp tokens, exchanges them, signs JWTs |
| **SDK Server** (`@veiller/sdk`) | `cloud/packages/sdk/src/app/webview/index.ts` | `createVeillerAuthRoutes()` — backend auth endpoint that exchanges tokens with Cloud |
| **React SDK** (`@veiller/react`) | `cloud/packages/react-sdk/src/` | `VeillerAuthProvider` + `useVeillerAuth()` — frontend token extraction and verification |
| **Developer's App** | e.g., `cloud/packages/apps/sdk-test/` | Uses all of the above |

---

## Two Auth Paths

The SDK has a built-in `/veiller-auth` endpoint (registered automatically by `AppServer`) that handles the browser OAuth fallback. Combined with the automatic mobile injection, this means **every webview works from both the Veiller app and a regular browser** without the developer writing any auth code.

---

## Path A: Mobile App Webview (Automatic)

### Step 1: Mobile App Opens Webview

When the user taps "Open Web View" for a mini app, the Veiller phone app does this (`mobile/src/app/applet/webview.tsx`):

1. **Generates a temp token** — calls Cloud `POST /api/auth/generate-webview-token` with the user's core auth token and the app's `packageName`. Cloud creates a short-lived opaque token tied to this user+app.

2. **Generates a signed user token (JWT)** — calls Cloud `POST /api/auth/generate-webview-signed-user-token`. Cloud creates a JWT signed with its private key containing:
   - `sub`: the userId
   - `frontendToken`: a hash-based token the frontend can use for backend API calls
   - `iss`: `https://prod.augmentos.cloud`
   - `exp`: short expiry

3. **Constructs the URL** with all tokens appended:
   ```
   https://myapp.ngrok.app/webview
     ?aos_temp_token=<opaque-temp-token>
     &aos_signed_user_token=<signed-jwt>
     &cloudApiUrl=https://api.mentra.glass
     &cloudApiUrlChecksum=<hmac-of-url>
   ```

4. **Opens WebView** — React Native `WebView` component loads this URL.

### Step 2: React SDK Picks Up Tokens

The developer's frontend wraps their app in `<VeillerAuthProvider>`:

```tsx
// frontend entry point
import { VeillerAuthProvider } from "@veiller/react";

<VeillerAuthProvider>
  <App />
</VeillerAuthProvider>
```

On mount, `VeillerAuthProvider` calls `initializeAuth()` (`react-sdk/src/lib/authCore.ts`) which:

1. **Checks URL for `aos_signed_user_token`** (Priority 1)
   - Parses the JWT using `jsrsasign`
   - Verifies the signature against Veiller Cloud's **public key** (hardcoded in the SDK)
   - Verifies claims: `iss`, `exp`, `alg` (RS256), with 120s grace period
   - Extracts `sub` (userId) and `frontendToken` from the payload

2. **Also exchanges `aos_temp_token` if present** (Priority 2, runs in parallel)
   - Calls the app's backend: `GET /api/veiller/auth/init?aos_temp_token=...&aos_signed_user_token=...`
   - This sets a **session cookie** so future requests don't need tokens in the URL

3. **Stores in localStorage** — `veiller_user_id` and `veiller_frontend_token`

4. **Cleans the URL** — removes all `aos_*` params from the browser URL via `history.replaceState()`

5. **Falls back to localStorage** on subsequent loads (page refreshes within the webview)

### Step 3: Token Exchange with App Backend

The SDK's `createVeillerAuthRoutes()` mounts at `/api/veiller/auth` and handles the `GET /init` endpoint:

```
GET /api/veiller/auth/init?aos_temp_token=XXX&aos_signed_user_token=YYY
```

Server-side (`sdk/src/app/webview/index.ts`):

1. **Try signed user token first** — verify JWT with the same public key, extract userId
2. **Try temp token** — call Cloud `POST /api/auth/exchange-user-token` with the temp token + app's API key → Cloud returns `{ userId }`
3. **Generate frontend token** — `userId:sha256(userId + sha256(apiKey))` — a hash the backend can verify later
4. **Sign session cookie** — HMAC-signed `userId|timestamp|signature` stored as `{packageName}-session` cookie
5. **Return** `{ success: true, userId, frontendToken }`

### Step 4: Session Established

After `initializeAuth()` completes, the developer's component gets everything via the hook:

```tsx
const { userId, frontendToken, isAuthenticated, isLoading, error } = useVeillerAuth();
// userId is available immediately — no manual entry needed
```

All subsequent API calls from the webview can either:
- **Use the session cookie** (automatic, set by `/api/veiller/auth/init`)
- **Send `Authorization: Bearer ${frontendToken}`** header (explicit, for API calls)

---

## Path B: Browser OAuth via `/veiller-auth`

When a user opens your webview URL directly in a browser (desktop, mobile Safari/Chrome — not inside the Veiller app), there are no `aos_*` tokens in the URL. The `@veiller/react` auth provider will find nothing to extract and `isAuthenticated` will be `false`.

This is where the `/veiller-auth` OAuth redirect comes in.

### How the Browser OAuth Flow Works

The SDK's `AppServer` automatically registers a `/veiller-auth` route on every app:

```
// Registered automatically by AppServer.setupVeillerAuthRedirect()
GET /veiller-auth
  → 302 redirect to https://account.mentra.glass/auth?packagename=com.example.myapp
```

The full flow:

1. **User visits your webview in a browser** — no tokens present, `useVeillerAuth()` returns `isAuthenticated: false`

2. **Your app shows a "Sign in with Veiller" button** that links to `/veiller-auth`

3. **SDK redirects to `account.mentra.glass`** — the Veiller account portal:
   ```
   https://account.mentra.glass/auth?packagename=com.example.myapp
   ```

4. **User logs in at `account.mentra.glass`** — if not already logged in, they authenticate with their Veiller credentials (email/password, Google, etc.)

5. **`account.mentra.glass` calls Cloud API** to:
   - Look up the app's `webviewURL` via `GET /api/account/oauth/app/:packageName`
   - Generate a signed user token via `POST /api/account/oauth/token` with `{ packageName }`
   - Cloud's `tokenService.issueUserToken(userEmail, packageName)` creates the same JWT format as the mobile path

6. **Redirect back to your app's webview URL** with tokens appended:
   ```
   https://myapp.ngrok.app/webview?aos_signed_user_token=<jwt>&aos_temp_token=<token>
   ```

7. **`@veiller/react` takes over** — from here, the flow is identical to Path A Step 2:
   - Verifies the JWT client-side
   - Exchanges the temp token via `/api/veiller/auth/init`
   - Sets session cookie
   - `useVeillerAuth()` returns `{ userId, frontendToken, isAuthenticated: true }`

### Browser OAuth Sequence Diagram

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Browser  │   │ SDK App  │   │ account. │   │  Cloud   │
│          │   │ Backend  │   │ veiller.  │   │  API     │
│          │   │          │   │ glass    │   │          │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │
     │ GET /webview │              │              │
     │─────────────►│              │              │
     │  (no tokens) │              │              │
     │◄─────────────│              │              │
     │  page loads, │              │              │
     │  isAuthenticated=false      │              │
     │              │              │              │
     │ User clicks "Sign in with Veiller"          │
     │ GET /veiller-auth            │              │
     │─────────────►│              │              │
     │ 302 redirect │              │              │
     │◄─────────────│              │              │
     │              │              │              │
     │ GET /auth?packagename=...   │              │
     │────────────────────────────►│              │
     │              │              │              │
     │              │  (user logs in if needed)   │
     │              │              │              │
     │              │   GET /api/account/oauth/   │
     │              │     app/:packageName        │
     │              │              │─────────────►│
     │              │              │ { webviewURL }│
     │              │              │◄─────────────│
     │              │              │              │
     │              │   POST /api/account/oauth/  │
     │              │     token { packageName }   │
     │              │              │─────────────►│
     │              │              │ { signedToken }
     │              │              │◄─────────────│
     │              │              │              │
     │ 302 redirect to webviewURL?aos_signed_user_token=...
     │◄────────────────────────────│              │
     │              │              │              │
     │ GET /webview?aos_signed_user_token=...     │
     │─────────────►│              │              │
     │  @veiller/react takes over   │              │
     │  (same as Path A from here) │              │
     │              │              │              │
```

### Adding "Sign in with Veiller" to Your App

When `isAuthenticated` is false, show a login button:

```tsx
const { isAuthenticated, isLoading } = useVeillerAuth();

if (!isAuthenticated && !isLoading) {
  return (
    <a href="/veiller-auth">
      <img
        src="https://account.mentra.glass/sign-in-mentra.png"
        alt="Sign in with Veiller"
        width="140"
        height="50"
      />
    </a>
  );
}
```

The `/veiller-auth` redirect is set up automatically by `AppServer` — no configuration needed. It reads the `packageName` from your app config and constructs the redirect URL.

**Key point:** The developer doesn't implement any OAuth logic. They just link to `/veiller-auth` and the SDK + Cloud + `account.mentra.glass` handle the entire flow. When the user comes back, `@veiller/react` processes the tokens exactly as it would from the mobile app.

---

## Token Types

| Token | Format | Issuer | Lifetime | Verified By | Purpose |
|-------|--------|--------|----------|-------------|---------|
| `aos_temp_token` | Opaque string | Cloud | ~60 seconds | Cloud (server-side exchange) | One-time use, exchanged for userId via backend |
| `aos_signed_user_token` | JWT (RS256) | Cloud | ~5 minutes | Anyone with Cloud's public key (client-side) | Client-side verification, contains userId + frontendToken |
| `frontendToken` | `userId:sha256(userId + sha256(apiKey))` | SDK server | Until API key changes | SDK server (hash comparison) | Frontend → Backend API auth |
| Session cookie | `userId\|timestamp\|hmac` | SDK server | 30 days | SDK server (HMAC verification) | Stateless session persistence |

### Why Two Tokens?

- **`aos_signed_user_token` (JWT)**: Can be verified **client-side** without hitting a server. The React SDK verifies it instantly using the public key. This means the frontend knows the `userId` immediately.

- **`aos_temp_token`**: Requires a **server-side exchange** with Cloud (the SDK backend calls Cloud). This is more secure (the token is opaque, tied to a package, one-time-use) and establishes the session cookie. It's the source of truth.

Both are sent because: the JWT gives instant client-side auth, while the temp token establishes a secure server-side session. Belt and suspenders.

---

## Auth Routes in the SDK

### `createVeillerAuthRoutes(options)` — Hono sub-app

**Mount point:** `/api/veiller/auth`

```typescript
import { createVeillerAuthRoutes } from "@veiller/sdk";

app.route("/api/veiller/auth", createVeillerAuthRoutes({
  apiKey: API_KEY,
  packageName: PACKAGE_NAME,
  cookieSecret: COOKIE_SECRET,
}));
```

**Routes:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/init` | Exchange tokens for session. Accepts `aos_temp_token`, `aos_signed_user_token`, `cloudApiUrl`, `cloudApiUrlChecksum` as query params. Returns `{ success, userId, frontendToken }` and sets session cookie. |

### `createAuthMiddleware(options)` — Hono middleware

For protecting API routes. Checks (in order):
1. `aos_signed_user_token` query param → verify JWT
2. `aos_temp_token` query param → exchange with Cloud
3. `Authorization: Bearer <frontendToken>` header → verify hash
4. Session cookie → verify HMAC signature

Sets `c.get("authUserId")` and `c.get("activeSession")` on the Hono context.

---

## React SDK (`@veiller/react`)

### `VeillerAuthProvider`

React context provider. Wrap your entire app:

```tsx
<VeillerAuthProvider>
  <App />
</VeillerAuthProvider>
```

On mount, runs `initializeAuth()` which handles the full token extraction → verification → storage → URL cleanup flow.

### `useVeillerAuth()`

Hook that returns:

```typescript
interface VeillerAuthContextType {
  userId: string | null;        // The authenticated user's ID
  frontendToken: string | null; // JWT for backend API calls
  isLoading: boolean;           // True during token verification
  error: string | null;         // Error message if auth failed
  isAuthenticated: boolean;     // True when userId && frontendToken are set
  logout: () => void;           // Clears stored auth
}
```

### Auth Priority Chain (`initializeAuth`)

```
1. aos_signed_user_token in URL?  →  verify JWT client-side  →  extract userId + frontendToken
2. aos_temp_token in URL?         →  exchange via /api/veiller/auth/init  →  get userId + frontendToken
3. localStorage has stored auth?  →  use cached userId + frontendToken
4. None of the above              →  { userId: null, frontendToken: null }
```

---

## Making Authenticated API Calls

From the webview frontend to the app backend:

```typescript
const { userId, frontendToken } = useVeillerAuth();

// Option A: Use frontendToken as Bearer token
const res = await fetch(`/api/photo/take?userId=${userId}`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${frontendToken}`,
    "Content-Type": "application/json",
  },
});

// Option B: Session cookie is sent automatically (same origin)
// The cookie was set by /api/veiller/auth/init
const res = await fetch(`/api/photo/take?userId=${userId}`, {
  method: "POST",
  credentials: "include",
});
```

The SDK's `createAuthMiddleware` verifies either method and sets `authUserId` on the request context.

---

## How the userId Reaches the Developer

This is the critical thing to understand: **the developer never asks the user for their ID**. The flow is:

```
User taps "Open Webview" on phone
    → Phone generates tokens, appends to URL
        → WebView loads URL
            → @veiller/react extracts tokens from URL params
                → Verifies JWT (client-side) + exchanges temp token (server-side)
                    → userId is available via useVeillerAuth()
                        → Developer uses userId for API calls
```

The userId in the webview is **the same userId** that the backend receives in `onSession(session, sessionId, userId)`. The user who's wearing the glasses and the user viewing the webview are cryptographically guaranteed to be the same person.

---

## Sequence Diagram

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  Phone   │   │  Cloud   │   │ WebView  │   │ SDK      │   │ Dev Code │
│  App     │   │          │   │ (React)  │   │ Backend  │   │          │
└────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │              │              │
     │ POST /auth/generate-       │              │              │
     │   webview-token            │              │              │
     │─────────────►│              │              │              │
     │   { tempToken }            │              │              │
     │◄─────────────│              │              │              │
     │              │              │              │              │
     │ POST /auth/generate-       │              │              │
     │   webview-signed-user-token│              │              │
     │─────────────►│              │              │              │
     │   { signedUserToken (JWT) }│              │              │
     │◄─────────────│              │              │              │
     │              │              │              │              │
     │ Open WebView:               │              │              │
     │ /webview?aos_temp_token=T   │              │              │
     │   &aos_signed_user_token=J  │              │              │
     │────────────────────────────►│              │              │
     │              │              │              │              │
     │              │  initializeAuth()          │              │
     │              │  1. Verify JWT (client)     │              │
     │              │     → extract userId        │              │
     │              │              │              │              │
     │              │  2. GET /api/veiller/auth/init              │
     │              │     ?aos_temp_token=T       │              │
     │              │     &aos_signed_user_token=J│              │
     │              │  ─────────────────────────►│              │
     │              │              │              │              │
     │              │              │ POST /api/auth/exchange-    │
     │              │              │   user-token │              │
     │              │              │   { tempToken, packageName }│
     │              │              │──────────────►│              │
     │              │              │   { userId }  │              │
     │              │              │◄──────────────│              │
     │              │              │              │              │
     │              │   { userId, frontendToken } │              │
     │              │   + Set-Cookie: session     │              │
     │              │  ◄─────────────────────────│              │
     │              │              │              │              │
     │              │  3. Store in localStorage   │              │
     │              │  4. Clean URL params         │              │
     │              │              │              │              │
     │              │  useVeillerAuth() returns:   │              │
     │              │  { userId, frontendToken,    │              │
     │              │    isAuthenticated: true }   │              │
     │              │  ──────────────────────────────────────────►
     │              │              │              │   Developer  │
     │              │              │              │   has userId  │
     │              │              │              │   without     │
     │              │              │              │   asking user │
```

---

## File Map

### Mobile Client
```
mobile/src/app/applet/webview.tsx
  └─ generateTokenAndSetUrl()
     ├─ restComms.generateWebviewToken(packageName)         → POST /api/auth/generate-webview-token
     ├─ restComms.generateWebviewToken(packageName, "...")   → POST /api/auth/generate-webview-signed-user-token
     ├─ restComms.hashWithApiKey(cloudApiUrl, packageName)   → POST /api/auth/hash-with-api-key
     └─ Constructs URL: webviewURL?aos_temp_token=...&aos_signed_user_token=...
```

### Cloud (Token Issuance & Exchange)
```
cloud/packages/cloud/src/api/hono/routes/auth.routes.ts
  ├─ POST /generate-webview-token              → creates opaque temp token (mobile path)
  ├─ POST /generate-webview-signed-user-token  → creates signed JWT (mobile path)
  ├─ POST /exchange-user-token                 → validates temp token, returns userId
  └─ POST /hash-with-api-key                   → HMAC for cloudApiUrl validation

cloud/packages/cloud/src/api/hono/routes/account.routes.ts
  ├─ GET  /oauth/app/:packageName              → app info + webviewURL for OAuth redirect
  └─ POST /oauth/token                         → generate signed JWT for browser OAuth flow
```

### SDK Server (`@veiller/sdk`)
```
cloud/packages/sdk/src/app/server/index.ts
  └─ setupVeillerAuthRedirect()     → GET /veiller-auth → 302 to account.mentra.glass/auth
                                     (browser OAuth entry point, registered automatically)

cloud/packages/sdk/src/app/webview/index.ts
  ├─ createVeillerAuthRoutes()      → Hono sub-app mounted at /api/veiller/auth
  │   └─ GET /init                 → exchanges tokens, sets cookie, returns userId
  ├─ createAuthMiddleware()        → Hono middleware for protecting API routes
  ├─ verifySignedUserToken()       → JWT verification with Cloud public key
  ├─ exchangeToken()               → temp token → Cloud → userId
  ├─ generateFrontendToken()       → userId:hash for frontend API auth
  ├─ signSession() / verifySession() → HMAC-based session cookie
  └─ verifyFrontendToken()         → hash comparison for Bearer token auth
```

### React SDK (`@veiller/react`)
```
cloud/packages/react-sdk/src/
  ├─ AuthProvider.tsx              → VeillerAuthProvider (React Context)
  ├─ useVeillerAuth.ts             → useVeillerAuth() hook
  └─ lib/authCore.ts              → initializeAuth(), verifyAndParseToken(), exchangeTempToken()
      ├─ Priority 1: verify aos_signed_user_token (JWT, client-side)
      ├─ Priority 2: exchange aos_temp_token via /api/veiller/auth/init
      └─ Priority 3: fall back to localStorage
```

### Developer's App (example)
```
cloud/packages/apps/sdk-test/src/
  ├─ index.ts                      → mounts createVeillerAuthRoutes() at /api/veiller/auth
  └─ frontend/
      ├─ frontend.tsx              → wraps <App /> in <VeillerAuthProvider>
      └─ App.tsx                   → const { userId } = useVeillerAuth()
```

---

## Common Mistakes

### ❌ Asking the user to enter their User ID
The entire auth system exists so you **never** have to do this. If you find yourself adding a text input for "User ID", you're not using the auth system. Wrap your frontend in `<VeillerAuthProvider>` and use `useVeillerAuth()`. For browser access, show a "Sign in with Veiller" link pointing to `/veiller-auth`.

### ❌ Forgetting to mount `createVeillerAuthRoutes()`
Without this, the temp token exchange has nowhere to go. The React SDK's `initializeAuth()` calls `GET /api/veiller/auth/init` — if that route doesn't exist, auth silently falls back to JWT-only (no session cookie).

```typescript
// Required in your app's entry point:
app.route("/api/veiller/auth", createVeillerAuthRoutes({
  apiKey: API_KEY,
  packageName: PACKAGE_NAME,
  cookieSecret: COOKIE_SECRET,
}));
```

### ❌ Not setting the Webview URL in the Developer Console
The phone app looks up the webview URL from the app's registration. If `webviewURL` is not set, there's no webview button to tap. Set it via CLI:
```bash
veiller app update com.example.myapp --webview-url https://myapp.example.com/webview
```

### ❌ Serving the webview at `/` but registering `/webview`
The webview URL in the console must match where your app actually serves the HTML. Standard pattern is to serve at both `/` and `/webview` (and `/webview/*` for SPA routing).

### ❌ Not including `@veiller/react` as a dependency
The React SDK verifies the JWT client-side using `jsrsasign`. Without it, you'd have to implement the entire token extraction, JWT verification, localStorage caching, and URL cleanup yourself.

### ❌ Using the webview without glasses connected
The `userId` from auth is the same across glasses session and webview. But the `AppSession` (for camera, audio, etc.) only exists when glasses are connected. Check that `appSession` is not null before calling SDK methods.

### ❌ Building a custom login flow instead of using `/veiller-auth`
The SDK automatically registers `GET /veiller-auth` on every `AppServer`. It redirects to `account.mentra.glass/auth?packagename=...` which handles the entire login UI, token generation, and redirect back to your `webviewURL`. You don't need to build any login pages — just link to `/veiller-auth` when the user isn't authenticated.

### ❌ Assuming auth only works inside the Veiller app
Both paths produce the same result. The mobile path is automatic (tokens injected in the URL). The browser path requires one click ("Sign in with Veiller" → `/veiller-auth`). After that, `useVeillerAuth()` returns the same `{ userId, frontendToken }` regardless of which path was used.