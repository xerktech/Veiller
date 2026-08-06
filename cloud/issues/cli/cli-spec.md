# Veiller CLI Spec

Command-line tool for app developers to manage Veiller apps and organizations.

## Problem

Developers currently need browser UI for all operations:

- Create/update apps: 3-5 minutes per change
- Copy/paste API keys manually
- No CI/CD support
- App configs not in version control
- Context switching: Terminal → Browser → Editor

**Target:** Same operations in <30 seconds from terminal, CI/CD compatible.

## Goals

### Primary

1. CLI API key authentication (no password prompts)
2. App CRUD + publish, API key regeneration, export/import
3. Organization list/switch (read-only for MVP)
4. Export configs to JSON for git tracking
5. Non-interactive mode for CI/CD

### Non-Goals

- Member management (Phase 2)
- App scaffolding templates (Phase 2)
- Real-time log streaming (Phase 2)
- Replace developer console web UI

## Authentication: CLI API Keys

### Why Not Email/Password Login?

- No password storage risk
- No session expiration
- Granular revocation
- Matches industry patterns (npm, GitHub PATs)

### Token Structure (JWT)

```json
{
  "email": "dev@example.com",
  "type": "cli",
  "keyId": "uuid-v4",
  "name": "My Laptop",
  "iat": 1705320000,
  "exp": 1736856000
}
```

### Database Model: `CLIKey`

```typescript
{
  keyId: string;              // UUID v4, unique
  userId: ObjectId;           // User reference
  email: string;              // Denormalized (future: phone auth)
  name: string;               // User-friendly ("My Laptop")
  hashedToken: string;        // SHA-256(JWT)
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;          // Soft delete
  metadata?: {
    createdFrom?: string;     // IP
    userAgent?: string;
  }
}
```

**Indexes:**

- `keyId` (unique)
- `hashedToken` (unique)
- `userId + isActive`
- `email + isActive`
- `expiresAt + isActive`

### Flow

**Generation (Console UI):**

```
Settings → CLI Keys → Generate
  → Enter name ("My Laptop")
  → Optional expiration
  → Backend: Generate JWT + store SHA-256 hash
  → Show token ONCE
```

**CLI Authentication:**

```bash
$ veiller auth eyJhbGci...
✓ Authenticated as dev@example.com
✓ Credentials saved to ~/.veiller/credentials.json
```

**Security:**

- Token shown once, never retrievable
- Middleware checks `isActive` on every request
- `lastUsedAt` updated async
- Instant revocation via console UI

## Commands

### Authentication

```bash
veiller auth <token>              # Authenticate, store in ~/.veiller/credentials.json
veiller logout                    # Clear credentials
veiller whoami                    # Show user, org, key info
```

### Apps

```bash
veiller app list [--org <id>]     # List apps
veiller app create                # Interactive or --flags
veiller app get <pkg>             # JSON output
veiller app update <pkg>          # Interactive or --flags
veiller app delete <pkg>          # Requires confirmation
veiller app publish <pkg>         # Submit to store
veiller app api-key <pkg>         # Regenerate (show once)
veiller app export <pkg> [-o file] # JSON export
veiller app import <file>         # JSON import
```

### Organizations (Read-Only MVP)

```bash
veiller org list                  # List user's orgs
veiller org get [org-id]          # Details (default org if no ID)
veiller org switch <org-id>       # Set default org
```

### Cloud Management

```bash
veiller cloud list                # List available clouds
veiller cloud current             # Show current cloud
veiller cloud use <cloud>         # Switch cloud (staging, production, etc.)
veiller cloud add <key>           # Add custom cloud
veiller cloud remove <cloud>      # Remove custom cloud
```

### Config

```bash
veiller config set <key> <value>
veiller config get <key>
veiller config list
```

### Global Flags

```bash
--json        # JSON output for scripting
--quiet       # Suppress non-essential output
--verbose     # Debug info
--org <id>    # Override default org
--no-color    # Disable colors
```

## Command Examples

### `veiller app create` (Interactive)

```bash
$ veiller app create
? Package name: org.example.myapp
? App name: My App
? Description: ...
? App type: background / standard
? Public URL: https://...

✓ App created: org.example.myapp
🔑 API Key: aos_abc123... (SAVE THIS)
```

### `veiller app create` (Flags)

```bash
$ veiller app create \
  --package-name org.example.myapp \
  --name "My App" \
  --app-type background \
  --public-url https://...
```

### `veiller app export`

```bash
$ veiller app export org.example.myapp
Exported to org.example.myapp.json

# Custom output
$ veiller app export org.example.myapp -o config.json

# Stdout
$ veiller app export org.example.myapp -o -
```

**Export Format:**

```json
{
  "packageName": "org.example.myapp",
  "name": "My App",
  "description": "...",
  "appType": "background",
  "publicUrl": "https://...",
  "logoURL": "https://...",
  "permissions": [
    {"type": "MICROPHONE", "description": "..."}
  ],
  "settings": [...],
  "tools": [],
  "hardwareRequirements": [],
  "version": "1.0.0"
}
```

### `veiller app import`

```bash
$ veiller app import config.json

Changes detected:
  ~ description: "old" → "new"
  + permission: LOCATION

? Apply changes? (Y/n) y
✓ App updated

# Force (CI/CD)
$ veiller app import config.json --force
```

## Cloud Management

### Built-in Clouds

**File:** `packages/cli/src/config/clouds.yaml`

```yaml
production:
  name: Production
  url: https://api.mentra.glass
  default: true

staging:
  name: Staging
  url: https://staging-api.mentra.glass

development:
  name: Development
  url: https://dev-api.mentra.glass

local:
  name: Local Development
  url: http://localhost:8002
```

### Custom Clouds (User Config)

Users can add custom clouds via `~/.veiller/config.json`:

```json
{
  "clouds": {
    "isaiah-test": {
      "name": "Isaiah's Test Cloud",
      "url": "https://isaiah.mentra.glass"
    },
    "team-dev": {
      "name": "Team Dev Server",
      "url": "https://dev.team.mentra.glass"
    }
  },
  "currentCloud": "production"
}
```

### Commands

```bash
# List all clouds
$ veiller cloud list

Available Clouds:

Built-in:
  * production  Production           https://api.mentra.glass
    staging     Staging              https://staging-api.mentra.glass
    development Development          https://dev-api.mentra.glass
    local       Local Development    http://localhost:8002

Custom:
    isaiah-test Isaiah's Test Cloud https://isaiah.mentra.glass
    team-dev    Team Dev Server      https://dev.team.mentra.glass

* = current cloud

# Switch clouds
$ veiller cloud use staging
✓ Switched to Staging (https://staging-api.mentra.glass)

# Add custom cloud
$ veiller cloud add my-cloud \
  --name "My Cloud" \
  --url https://my-cloud.mentra.glass
✓ Added cloud 'my-cloud'

# Remove custom cloud
$ veiller cloud remove my-cloud
✓ Removed cloud 'my-cloud'

# Show current
$ veiller cloud current
production (https://api.mentra.glass)
```

### Priority Override

```
1. VEILLER_API_URL env var (highest priority)
2. Current cloud from config
3. "production" (default fallback)
```

## Configuration Files

### Credentials Storage: `Bun.secrets` (Primary)

Credentials stored securely in OS-native keychain:

- **macOS:** Keychain
- **Linux:** libsecret
- **Windows:** Credential Manager

```typescript
// Stored in OS keychain as:
await Bun.secrets.set({
  service: "veiller-cli",
  name: "credentials",
  value: JSON.stringify({
    token: "eyJhbGci...",
    email: "dev@example.com",
    keyName: "My Laptop",
    keyId: "uuid",
    storedAt: "2024-01-15T...",
    expiresAt: "2025-01-15T...",
  }),
})
```

**Fallback:** `~/.veiller/credentials.json` (chmod 600) if `Bun.secrets` unavailable

### `~/.veiller/config.json` (chmod 600)

```json
{
  "clouds": {
    "isaiah-test": {
      "name": "Isaiah's Test Cloud",
      "url": "https://isaiah.mentra.glass"
    }
  },
  "currentCloud": "production",
  "output": {
    "format": "table",
    "colors": true
  },
  "default": {
    "org": "org_abc123"
  }
}
```

### `.veillerrc` (Optional, per-project)

```json
{
  "packageName": "org.example.myapp",
  "org": "org_abc123"
}
```

## API Endpoints

### New: CLI Key Management (Console Auth)

```
POST   /api/console/cli-keys              # Generate key
GET    /api/console/cli-keys              # List keys
GET    /api/console/cli-keys/:keyId       # Get key
PATCH  /api/console/cli-keys/:keyId       # Rename
DELETE /api/console/cli-keys/:keyId       # Revoke
```

### Existing: Reuse Console Routes (CLI Auth)

```
GET    /api/cli/apps                      # → /api/console/apps
POST   /api/cli/apps                      # → /api/console/apps
GET    /api/cli/apps/:pkg                 # → /api/console/apps/:pkg
PUT    /api/cli/apps/:pkg                 # → /api/console/apps/:pkg
DELETE /api/cli/apps/:pkg                 # → /api/console/apps/:pkg
POST   /api/cli/apps/:pkg/publish         # → /api/console/apps/:pkg/publish
POST   /api/cli/apps/:pkg/api-key         # → /api/console/apps/:pkg/api-key

GET    /api/cli/orgs                      # → /api/console/orgs
GET    /api/cli/orgs/:id                  # → /api/console/orgs/:id
```

**Implementation:** Transform `req.cli` → `req.console` to reuse handlers.

## Error Handling

### Exit Codes

```
0   Success
1   General error
2   Invalid arguments
3   Authentication error
4   Permission error
5   Resource not found
6   Network error
7   Validation error
```

### Error Messages

```bash
# Auth error
✗ Unauthorized: CLI API key invalid or revoked
  Generate new key: https://console.mentra.glass/settings/cli-keys

# Permission error
✗ Forbidden: Only admins can delete apps

# Validation error
✗ Invalid package name: must use reverse domain notation
  Example: org.example.myapp

# Network error
✗ Failed to connect to API
  Current: https://api.mentra.glass
```

## Use Cases

### 1. Developer Setup

```bash
npm install -g @veiller/cli
veiller auth <token-from-console>
veiller app create
veiller app export org.example.myapp
git add org.example.myapp.json
```

### 2. Terminal Workflow

```bash
veiller app update org.example.myapp --add-permission LOCATION
veiller app export org.example.myapp
git commit -am "Add location permission"
```

### 3. CI/CD

# CI/CD

```yaml
# Environment variable authentication
- run: VEILLER_CLI_TOKEN=${{ secrets.VEILLER_CLI_TOKEN }} veiller app list

# Or authenticate explicitly
- run: veiller auth ${{ secrets.VEILLER_CLI_TOKEN }}
- run: veiller cloud use staging
- run: veiller app import config.json --force
- run: veiller app publish org.example.myapp
```

### 4. Lost Laptop

```
Console → CLI Keys → Revoke "My Laptop"
  → Lost laptop immediately loses access
  → Other keys (desktop, CI) still work
```

### 5. Team Collaboration

```bash
# Lead creates app + exports config
veiller app create
veiller app export org.acme.team -o config.json
git add config.json && git push

# Team member updates via CLI
veiller auth <their-token>
vim config.json  # Edit
veiller app import config.json
git commit -am "Update permissions"
```

## Security: Credential Storage

### Primary: `Bun.secrets` (Requires Bun 1.3+)

Stores credentials in OS-native keychain:

- **macOS:** Keychain (prompts for access on first use)
- **Linux:** libsecret
- **Windows:** Credential Manager

```bash
$ veiller auth <token>
✓ Authenticated as dev@example.com
✓ Credentials saved securely to macOS Keychain
```

### Fallback: File-based

If `Bun.secrets` unavailable (older Bun, headless environments):

- Store in `~/.veiller/credentials.json` (chmod 600)
- Warn user about less secure storage
- Auto-migrate from file to secrets on upgrade

### CI/CD: Environment Variable

```bash
export VEILLER_CLI_TOKEN=<token>
veiller app list  # No auth command needed
```

## Open Questions

1. **Member management in CLI?** → Phase 2 (low priority, console works)
2. **App scaffolding (`veiller init`)?** → Phase 2 (needs SDK templates)
3. **Exported configs include orgId?** → Yes (optional field, ignored on import)
4. **Update checks?** → Once per day, show notice
5. **Bulk operations?** → Phase 2 (wait for usage data)
6. **Scoped API keys?** → Phase 2 (full access for MVP)
7. **Cloud auto-detection?** → Phase 2 (detect from API response)

## Phase 1 Scope

**In:**

- CLI tool (`@veiller/cli` package, Bun 1.3+ runtime)
- CLI key system (backend model + console UI + middleware)
- Credential storage: `Bun.secrets` (primary) + file fallback
- Cloud management: Built-in clouds + custom clouds
- Commands: `auth`, `whoami`, `logout`, `app list/create/get/update/delete/publish/api-key/export/import`, `org list/get/switch`, `cloud list/use/add/remove`, `config`
- Interactive + non-interactive modes
- JSON export/import
- Error handling

**Out (Phase 2):**

- Member management
- App scaffolding (`veiller init`)
- Real-time logs
- Scoped keys
- Bulk operations
- Shell completion
- Cloud auto-detection

## Distribution

**NPM:**

```bash
npm install -g @veiller/cli
# or
bun install -g @veiller/cli
```

**Package:** `@veiller/cli`  
**Binary:** `veiller`  
**Entry:** `packages/cli/src/index.ts`  
**Min Bun:** 1.3+ (for `Bun.secrets`)

**Config:**

- `~/.veiller/config.json` - Settings and custom clouds
- `~/.veiller/credentials.json` - Fallback if no `Bun.secrets`
- `.veillerrc` - Per-project config
- OS Keychain - Primary credential storage (via `Bun.secrets`)

**Environment Variables:**

- `VEILLER_CLI_TOKEN` - Token for CI/CD
- `VEILLER_API_URL` - Override API URL

**Future:** Homebrew, direct download scripts
