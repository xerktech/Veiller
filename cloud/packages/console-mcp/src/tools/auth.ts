import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConsoleMcpConfig } from "../config.ts";
import { textContent } from "./helpers.ts";

export function registerAuthTools(server: McpServer, config: ConsoleMcpConfig): void {
  server.registerTool(
    "console_auth_status",
    {
      description:
        "Report Veiller Console MCP host and which capability groups are configured (no secrets).",
      inputSchema: {},
    },
    async () => {
      return textContent({
        host: config.host,
        capabilities: config.capabilities,
        hints: {
          developer:
            "Set VEILLER_CLI_TOKEN (create CLI keys in Developer Console → CLI Keys; not via MCP)",
          incidents: "Set VEILLER_AGENT_API_KEY (internal agent API key)",
          admin:
            "Set VEILLER_ADMIN_JWT or VEILLER_ADMIN_TOKEN (core/session JWT for Veiller admin email; not a CLI key)",
        },
      });
    },
  );
}
