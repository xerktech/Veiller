import crypto from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";

import {
  getPublicJwks,
  issueRuntimeToken,
  resetSigningKeyCache,
} from "./session.service";

const savedEnv = {
  VEILLER_JWT_PRIVATE_KEY: process.env.VEILLER_JWT_PRIVATE_KEY,
  VEILLER_JWT_PUBLIC_KEY: process.env.VEILLER_JWT_PUBLIC_KEY,
  VEILLER_MINIAPP_JWT_PRIVATE_KEY: process.env.VEILLER_MINIAPP_JWT_PRIVATE_KEY,
  VEILLER_MINIAPP_JWT_PUBLIC_KEY: process.env.VEILLER_MINIAPP_JWT_PUBLIC_KEY,
};

afterEach(() => {
  restoreEnv("VEILLER_JWT_PRIVATE_KEY", savedEnv.VEILLER_JWT_PRIVATE_KEY);
  restoreEnv("VEILLER_JWT_PUBLIC_KEY", savedEnv.VEILLER_JWT_PUBLIC_KEY);
  restoreEnv("VEILLER_MINIAPP_JWT_PRIVATE_KEY", savedEnv.VEILLER_MINIAPP_JWT_PRIVATE_KEY);
  restoreEnv("VEILLER_MINIAPP_JWT_PUBLIC_KEY", savedEnv.VEILLER_MINIAPP_JWT_PUBLIC_KEY);
  resetSigningKeyCache();
});

describe("Core JWKS", () => {
  test("publishes the kid used by Core-brokered runtime tokens", async () => {
    setSigningEnv();

    const [{ token }, jwks] = await Promise.all([
      issueRuntimeToken({ mentraUserId: "user-1", tenantId: "oem-1" }),
      getPublicJwks(),
    ]);

    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as {
      kid: string;
    };
    const kids = jwks.keys.map((key) => key.kid);

    expect(header.kid).toBe("cloud-core-runtime-1");
    expect(kids).toContain(header.kid);
    expect(kids).toContain("veiller-access-1");
    expect(kids).toContain("veiller-miniapp-1");
  });
});

function setSigningEnv(): void {
  const access = createEd25519Keypair();
  const miniapp = createEd25519Keypair();
  const account = createEd25519Keypair();
  process.env.VEILLER_JWT_PRIVATE_KEY = access.privateKey;
  process.env.VEILLER_JWT_PUBLIC_KEY = access.publicKey;
  process.env.VEILLER_MINIAPP_JWT_PRIVATE_KEY = miniapp.privateKey;
  process.env.VEILLER_MINIAPP_JWT_PUBLIC_KEY = miniapp.publicKey;
  // getPublicJwks now also publishes the account-token key (issue 019).
  process.env.VEILLER_ACCOUNT_JWT_PRIVATE_KEY = account.privateKey;
  process.env.VEILLER_ACCOUNT_JWT_PUBLIC_KEY = account.publicKey;
  resetSigningKeyCache();
}

function createEd25519Keypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey: stripPem(privateKey.export({ type: "pkcs8", format: "pem" }).toString()),
    publicKey: stripPem(publicKey.export({ type: "spki", format: "pem" }).toString()),
  };
}

function stripPem(pem: string): string {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
