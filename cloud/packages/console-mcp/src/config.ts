/**
 * Environment configuration and capability detection for veiller-console MCP.
 */

export type CapabilityGroup = "developer" | "incidents" | "admin";

export interface ConsoleMcpConfig {
  host: string;
  cliToken?: string;
  agentApiKey?: string;
  adminJwt?: string;
  capabilities: Record<CapabilityGroup, boolean>;
}

const DEFAULT_HOST = "https://api.mentra.glass";

export function loadConfig(): ConsoleMcpConfig {
  const host = (process.env.VEILLER_API_HOST || DEFAULT_HOST).replace(/\/$/, "");
  const cliToken = process.env.VEILLER_CLI_TOKEN?.trim() || undefined;
  const agentApiKey = process.env.VEILLER_AGENT_API_KEY?.trim() || undefined;
  const adminJwt =
    process.env.VEILLER_ADMIN_JWT?.trim() ||
    process.env.VEILLER_ADMIN_TOKEN?.trim() ||
    undefined;

  return {
    host,
    cliToken,
    agentApiKey,
    adminJwt,
    capabilities: {
      developer: Boolean(cliToken),
      incidents: Boolean(agentApiKey),
      admin: Boolean(adminJwt),
    },
  };
}

export function requireCapability(
  config: ConsoleMcpConfig,
  group: CapabilityGroup,
): void {
  if (!config.capabilities[group]) {
    const envHint =
      group === "developer"
        ? "VEILLER_CLI_TOKEN"
        : group === "incidents"
          ? "VEILLER_AGENT_API_KEY"
          : "VEILLER_ADMIN_JWT or VEILLER_ADMIN_TOKEN";
    throw new Error(
      `Capability "${group}" is not configured. Set ${envHint} in the MCP server environment.`,
    );
  }
}
