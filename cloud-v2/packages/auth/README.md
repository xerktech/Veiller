# @veiller/auth

Helpers for miniapp backends that need to verify Local Runtime auto-auth tokens.

```ts
import {createVeillerAuth, type VeillerAuthVariables} from "@veiller/auth";
import {Hono} from "hono";

const mentraAuth = createVeillerAuth({
  packageName: "com.example.miniapp",
});

const app = new Hono<{ Variables: VeillerAuthVariables }>();

app.use("/api/*", mentraAuth.hono());

app.post("/api/endpoint", async (c) => {
  const session = c.get("mentraAuth");
  return c.json({userId: session.mentraUserId});
});
```

Defaults:

- `packageName`: required, or set `VEILLER_PACKAGE_NAME`, `MINIAPP_PACKAGE_NAME`, or `PACKAGE_NAME`.
- `jwksUrl`: `VEILLER_AUTH_JWKS_URL`, falling back to `https://core.mentraglass.com/.well-known/jwks.json`.
- `issuer`: `VEILLER_AUTH_ISSUERS` as a comma-separated list, or `VEILLER_AUTH_ISSUER` as one value, falling back to `cloud-core`.

Use `jwksUrl` for local, staging, test, or self-hosted Core deployments:

```ts
const mentraAuth = createVeillerAuth({
  packageName: "com.example.miniapp",
  jwksUrl: "http://localhost:3000/.well-known/jwks.json",
});
```

Lower-level helpers are available when a framework middleware is not enough:

```ts
await mentraAuth.verifyToken(token);
await mentraAuth.verifyAuthHeader(header);
await mentraAuth.verifyRequest(request);
```
