# Quick Start Guide - Veiller Captions App

Get up and running in 5 minutes!

## 1. Install Dependencies

```bash
bun install
```

## 2. Configure Environment

Create `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
PORT=3333
PACKAGE_NAME=com.veiller.captions
VEILLER_API_KEY=your_api_key_here
NODE_ENV=development
```

**Get your API key:** https://console.mentra.glass

## 3. Start the App

```bash
bun run dev
```

This starts:

- ✅ Express server on port 3333 (Veiller integration + auth)
- ✅ Bun server on port 3334 (React webview + API routes)
- ✅ Automatic proxying between them

## 4. Authenticate (Local Development)

Visit this URL in your browser:

```
http://localhost:3333/veiller-auth
```

This will:

1. Redirect you to Veiller login
2. Show a consent screen
3. Redirect back with authentication
4. Set a session cookie

**You only need to do this once!** The session cookie persists.

## 5. Test It Works

### Test the Webview

```
http://localhost:3333
```

You should see the React app with Bun + React logos.

### Test Authentication

```bash
curl http://localhost:3333/api/me
```

**Expected response:**

```json
{
  "userId": "your-email@example.com",
  "hasSession": false,
  "isAuthenticated": true
}
```

### Test a Protected Route

```bash
curl http://localhost:3333/api/protected-example
```

**Expected response:**

```json
{
  "message": "This route requires authentication",
  "userId": "your-email@example.com",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Next Steps

### Add Your Own API Routes

Choose **Express** or **Bun** routes (or both!):

#### Option A: Bun Routes (Hot Reload ✨)

Edit `src/api/routes.ts`:

```typescript
import {requireAuth} from "./auth-helpers"

export const routes = {
  "/api/my-endpoint": requireAuth(async (req, userId) => {
    return Response.json({
      message: "Hello!",
      userId,
    })
  }),
}
```

**Save and refresh browser** - changes apply instantly!

#### Option B: Express Routes (Traditional)

Edit `src/index.ts` (before the proxy):

```typescript
expressApp.get("/api/my-endpoint", (req, res) => {
  const authReq = req as any
  if (!authReq.authUserId) {
    return res.status(401).json({error: "Not authenticated"})
  }
  res.json({message: "Hello!", userId: authReq.authUserId})
})
```

**Restart required:** Stop and run `bun run dev` again.

### Customize the Webview

Edit `src/webview/App.tsx`:

```tsx
export function App() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold">My Custom App!</h1>
    </div>
  )
}
```

Changes apply instantly with hot reload!

### Handle Glasses Sessions

Edit `src/app/CaptionsApp.ts`:

```typescript
protected async onSession(session: AppSession, sessionId: string, userId: string) {
  // Display text on glasses
  session.layouts.showTextWall("Hello from Captions!")

  // Subscribe to transcription
  session.subscribe("transcription")

  // Handle transcriptions
  session.events.onTranscription((data) => {
    console.log("Caption:", data.text)
    session.layouts.updateText({ text: data.text })
  })
}
```

## Common Tasks

### Check if authenticated

```bash
curl http://localhost:3333/api/me
```

### Re-authenticate (if session expired)

```
http://localhost:3333/veiller-auth
```

### Change port

```bash
PORT=4000 bun run dev  # Uses 4000 and 4001
```

### Test with ngrok (for OAuth testing)

```bash
# Terminal 1
bun run dev

# Terminal 2
ngrok http 3333

# Visit ngrok URL + /veiller-auth
https://your-subdomain.ngrok.app/veiller-auth
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Browser: http://localhost:3333                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Express (Port 3333) - "Front Door"                      │
│ • Auth middleware (handles tokens, sessions)            │
│ • Veiller webhooks (/session-start, /webhook)          │
│ • Proxies to Bun for unmatched routes                   │
│ • Forwards auth headers (x-auth-user-id)                │
└────────────────────┬────────────────────────────────────┘
                     │ (proxy)
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Bun (Port 3334) - "Backend"                             │
│ • React webview (hot reload)                            │
│ • API routes (src/api/routes.ts)                        │
│ • Tailwind/JSX processing                               │
│ • Reads auth from x-auth-user-id header                 │
└─────────────────────────────────────────────────────────┘
```

## Troubleshooting

### "Not authenticated" errors

**Solution:** Visit `/veiller-auth` first:

```
http://localhost:3333/veiller-auth
```

### Port already in use

**Solution:** Use a different port:

```bash
PORT=4000 bun run dev
```

### Changes not showing

- **Bun routes/webview:** Refresh browser (hot reload)
- **Express routes:** Restart the server

### Can't see webview

**Make sure you're using port 3333, not 3334:**

- ✅ `http://localhost:3333` (Express → proxy → Bun)
- ❌ `http://localhost:3334` (Bun directly, no auth)

## Documentation

- 📖 [AUTH-GUIDE.md](./AUTH-GUIDE.md) - Complete authentication guide
- 📖 [EXAMPLES.md](./EXAMPLES.md) - Express vs Bun code examples
- 📖 [README.md](./README.md) - Full project documentation
- 📖 [STRUCTURE.md](./STRUCTURE.md) - Architecture deep dive

## Help & Support

- Discord: https://discord.gg/5ukNvkEAqT
- Docs: https://docs.mentra.glass
- Console: https://console.mentra.glass

---

**You're all set!** 🎉

Start building your Veiller app with authentication working out of the box.
