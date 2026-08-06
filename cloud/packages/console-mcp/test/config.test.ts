import { describe, expect, test } from "bun:test";
import { loadConfig, requireCapability } from "../src/config.ts";

describe("loadConfig", () => {
  test("detects capabilities from env", () => {
    const prev = { ...process.env };
    process.env.VEILLER_CLI_TOKEN = "cli-test";
    process.env.VEILLER_AGENT_API_KEY = "agent-test";
    delete process.env.VEILLER_ADMIN_JWT;
    delete process.env.VEILLER_ADMIN_TOKEN;

    const config = loadConfig();
    expect(config.capabilities.developer).toBe(true);
    expect(config.capabilities.incidents).toBe(true);
    expect(config.capabilities.admin).toBe(false);
    expect(config.host).not.toMatch(/\/$/);

    process.env = prev;
  });

  test("admin alias from VEILLER_ADMIN_TOKEN", () => {
    const prev = { ...process.env };
    delete process.env.VEILLER_CLI_TOKEN;
    delete process.env.VEILLER_AGENT_API_KEY;
    process.env.VEILLER_ADMIN_TOKEN = "jwt-test";

    const config = loadConfig();
    expect(config.capabilities.admin).toBe(true);
    expect(config.adminJwt).toBe("jwt-test");

    process.env = prev;
  });
});

describe("requireCapability", () => {
  test("throws when capability missing", () => {
    const config = loadConfig();
    config.capabilities.developer = false;
    expect(() => requireCapability(config, "developer")).toThrow(/VEILLER_CLI_TOKEN/);
  });
});
