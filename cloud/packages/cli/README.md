# @veiller/cli

Command-line tool for managing Veiller apps and organizations.

## Installation

**Requires [Bun](https://bun.sh) 1.3.0 or higher.**

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install globally
bun install -g @veiller/cli

# Or run directly without installing
bunx @veiller/cli --help
```

## Quick Start

### 1. Generate CLI API Key

1. Go to [console.mentra.glass](https://console.mentra.glass)
2. Navigate to **Settings → CLI Keys**
3. Click **Generate New Key**
4. Copy the token (shown only once!)

### 2. Authenticate CLI

```bash
veiller auth <your-token>
```

Credentials are stored securely in your OS keychain (macOS Keychain, Linux libsecret, Windows Credential Manager).

### 3. Start Managing Apps

```bash
# List apps
veiller app list

# Get app details
veiller app get org.example.myapp

# List organizations
veiller org list

# Switch clouds
veiller cloud use staging
```

## Commands

### Authentication

```bash
veiller auth <token>              # Authenticate with CLI API key
veiller auth logout               # Clear credentials
veiller auth whoami               # Show current user info
```

### App Management

```bash
veiller app list [--org <id>]     # List apps
veiller app get <package-name>    # View app details
veiller app create                # Create new app (interactive or with flags)
veiller app update <package-name> # Update app metadata
veiller app delete <package-name> # Delete app (requires confirmation)
veiller app publish <package-name> # Publish to store
veiller app api-key <package-name> # Regenerate API key (shows once!)
veiller app export <package-name>  # Export config to JSON
veiller app import <file>         # Import config from JSON
```

### Organization Management

```bash
veiller org list                  # List organizations
veiller org get [org-id]          # Get org details
veiller org switch <org-id>       # Set default organization
```

### Cloud Management

```bash
veiller cloud list                # List available clouds
veiller cloud current             # Show current cloud
veiller cloud use <cloud>         # Switch cloud environment
veiller cloud add <key>           # Add custom cloud
veiller cloud remove <cloud>      # Remove custom cloud
```

**Built-in clouds:**

- `production` - https://api.mentra.glass (default)
- `staging` - https://staging-api.mentra.glass
- `development` - https://dev-api.mentra.glass
- `local` - http://localhost:8002

**Add custom cloud:**

```bash
veiller cloud add my-cloud --name "My Cloud" --url https://my-cloud.mentra.glass
veiller cloud use my-cloud
```

### Global Options

```bash
--json        # Output JSON (for scripting)
--quiet       # Suppress non-essential output
--verbose     # Show debug information
--no-color    # Disable colored output
```

## Configuration

### Config Directory: `~/.veiller/`

- **`config.json`** - Settings and custom clouds
- **`credentials.json`** - Fallback if Bun.secrets unavailable (chmod 600)
- **OS Keychain** - Primary credential storage (via Bun.secrets)

### Per-Project Config: `.veillerrc`

```json
{
  "packageName": "org.example.myapp",
  "org": "org_abc123"
}
```

Place in your project root to set defaults for that project.

## Environment Variables

```bash
# Override API URL
export VEILLER_API_URL=https://custom-api.mentra.glass

# Use CLI token without auth command (CI/CD)
export VEILLER_CLI_TOKEN=<your-cli-token>
veiller app list  # Works without running 'veiller auth'
```

## CI/CD Usage

### GitHub Actions

```yaml
name: Deploy App

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: "1.3"

      - name: List Apps
        env:
          VEILLER_CLI_TOKEN: ${{ secrets.VEILLER_CLI_TOKEN }}
        run: bunx @veiller/cli app list
```

Or if you prefer to install globally:

```yaml
- name: Install Veiller CLI
  run: bun install -g @veiller/cli

- name: List Apps
  env:
    VEILLER_CLI_TOKEN: ${{ secrets.VEILLER_CLI_TOKEN }}
  run: veiller app list
```

## Examples

### Create an App Interactively

```bash
veiller app create
# Prompts for: package name, name, description, type, URL, logo
```

### Create an App Non-Interactively

```bash
veiller app create \
  --package-name com.example.myapp \
  --name "My App" \
  --description "My awesome app" \
  --app-type standard \
  --public-url https://myapp.example.com \
  --logo-url https://myapp.example.com/logo.png
```

### Update an App

```bash
# Interactive mode - prompts for each field
veiller app update com.example.myapp

# Non-interactive mode with flags
veiller app update com.example.myapp --name "New Name" --description "New description"
```

### Delete an App

```bash
# Requires double confirmation
veiller app delete com.example.myapp

# Skip confirmation with --force (use carefully!)
veiller app delete com.example.myapp --force
```

### Publish an App to the Store

```bash
veiller app publish com.example.myapp

# Skip confirmation prompt
veiller app publish com.example.myapp --force
```

### Regenerate API Key

```bash
# Shows the new API key once - save it immediately!
veiller app api-key com.example.myapp

# Skip confirmation prompt
veiller app api-key com.example.myapp --force
```

### Export App Configuration

```bash
# Export to stdout
veiller app export com.example.myapp

# Export to file
veiller app export com.example.myapp -o myapp.json
```

### Import App Configuration

```bash
# Import from JSON file
veiller app import myapp.json

# Specify organization
veiller app import myapp.json --org org_abc123

# Skip confirmation
veiller app import myapp.json --force
```

### List Apps with JSON Output

```bash
veiller app list --json | jq '.[] | {name, packageName, status: .appStoreStatus}'
```

### Switch Between Clouds

```bash
# Work on staging
veiller cloud use staging
veiller app list

# Switch to production
veiller cloud use production
veiller app list
```

### Manage Multiple Organizations

```bash
# List all orgs
veiller org list

# Switch default org
veiller org switch org_xyz789

# All subsequent commands use this org
veiller app list
```

## Troubleshooting

### Authentication Issues

**Problem:** `✗ Not authenticated`

**Solution:**

```bash
# Re-authenticate
veiller auth <new-token>

# Or use environment variable
export VEILLER_CLI_TOKEN=<your-token>
```

**Problem:** `✗ CLI API key revoked or expired`

**Solution:**
Generate a new key in the console and re-authenticate.

### OS Keychain Issues

**Problem:** `⚠️  OS keychain unavailable, using file-based storage`

This happens if:

- Bun version is older than 1.3
- Running in headless environment (Docker, CI/CD)
- OS keychain service is not available

**Solution:**

- Upgrade to Bun 1.3+, or
- Use file-based storage (less secure but functional), or
- Use `VEILLER_CLI_TOKEN` environment variable in CI/CD

### Cloud Connection Issues

**Problem:** `✗ Failed to connect to API`

**Solution:**

```bash
# Check current cloud
veiller cloud current

# Try switching clouds
veiller cloud use production

# Or override API URL
export VEILLER_API_URL=https://api.mentra.glass
```

## Development

```bash
# Clone the repository
git clone https://github.com/veiller/veiller.git
cd veiller/cloud/packages/cli

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test
```

## Security

- **Credentials** stored in OS keychain (encrypted at rest)
- **Fallback** to file with `chmod 600` if keychain unavailable
- **Tokens** never logged or printed to console
- **Revocation** instant via console UI

## Links

- [Developer Console](https://console.mentra.glass)
- [Documentation](https://docs.mentra.glass)
- [GitHub](https://github.com/veiller/veiller)
- [Discord Community](https://discord.gg/5ukNvkEAqT)

## License

MIT
