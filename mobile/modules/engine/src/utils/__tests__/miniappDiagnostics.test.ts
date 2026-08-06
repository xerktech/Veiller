import {describe, expect, test} from "bun:test"

import type {ClientApp} from "../../types/applet"
import {
  buildMiniappDiagnosticContext,
  buildMiniappManifestSnapshot,
  type MiniappRuntimeDiagnosticSnapshot,
} from "../miniappDiagnostics"

function app(overrides: Partial<ClientApp>): ClientApp {
  return {
    packageName: "com.example.miniapp",
    name: "Example",
    webviewUrl: "",
    logoUrl: "",
    type: "standard",
    permissions: [],
    running: true,
    foregrounded: false,
    healthy: true,
    hardwareRequirements: [],
    offline: false,
    offlineRoute: "",
    loading: false,
    local: true,
    hidden: false,
    ...overrides,
  }
}

const runtime = (overrides?: Partial<MiniappRuntimeDiagnosticSnapshot>): MiniappRuntimeDiagnosticSnapshot => ({
  connectedApps: [],
  subscriptionsByStream: {},
  resources: {
    display: {},
    camera: {},
    video: {},
    stream: {},
    cameraFov: {},
  },
  ...overrides,
})

describe("miniapp diagnostics", () => {
  test("keeps routing/build manifest fields and excludes arbitrary content", () => {
    const manifest = buildMiniappManifestSnapshot(
      {
        packageName: "com.veiller.ai",
        name: "Mentra AI",
        version: "1.4.9",
        sdkVersion: "0.3.0",
        minHostVersion: "2.12.0",
        type: "standard",
        entry: {background: "background/index.js", ui: "ui/index.html"},
        permissions: [{type: "MICROPHONE", required: true, description: "free-form"}],
        hardwareRequirements: [{type: "MICROPHONE", level: "REQUIRED", description: "free-form"}],
        actions: [{id: "summarize", description: "free-form", parameters: {secret: "nope"}}],
        backendUrl: "https://private.example",
        apiKey: "must-not-leak",
      },
      {packageName: "fallback"},
    )

    expect(manifest).toEqual({
      packageName: "com.veiller.ai",
      name: "Mentra AI",
      version: "1.4.9",
      sdkVersion: "0.3.0",
      minHostVersion: "2.12.0",
      type: "standard",
      entry: {background: "background/index.js", ui: "ui/index.html"},
      permissions: [{type: "MICROPHONE", required: true}],
      hardwareRequirements: [{type: "MICROPHONE", level: "REQUIRED"}],
      actionIds: ["summarize"],
    })
    expect(JSON.stringify(manifest)).not.toContain("must-not-leak")
    expect(JSON.stringify(manifest)).not.toContain("private.example")
    expect(JSON.stringify(manifest)).not.toContain("free-form")
  })

  test("includes every running manifest, live subscriptions, release identity, and interaction order", () => {
    const apps = [
      app({packageName: "com.veiller.ai", name: "Mentra AI", version: "1.4.9", foregrounded: true}),
      app({
        packageName: "com.veiller.notes",
        name: "Veiller Notes",
        version: "1.0.11",
        running: false,
      }),
      app({
        packageName: "com.example.dev",
        name: "Dev Miniapp",
        version: undefined,
        isMiniappDev: true,
        devUrl: "http://192.168.1.2:3140",
      }),
    ]
    const runtimeSnapshot = runtime({
      connectedApps: [
        {
          packageName: "com.veiller.ai",
          handshakeComplete: true,
          subscriptions: ["button_press", "transcription:auto"],
          lastMessageAgeMs: 25,
          requestedLocationRate: null,
          hasActiveSpeakerStream: false,
        },
        {
          packageName: "com.example.dev",
          handshakeComplete: true,
          subscriptions: ["location_stream"],
          lastMessageAgeMs: 50,
          requestedLocationRate: "high",
          hasActiveSpeakerStream: false,
          manifest: buildMiniappManifestSnapshot(
            {
              packageName: "com.example.dev",
              version: "0.4.0",
              sdkVersion: "0.3.0",
              actions: [{id: "dev_action"}],
            },
            {packageName: "com.example.dev"},
          ),
        },
      ],
      subscriptionsByStream: {
        "button_press": ["com.veiller.ai"],
        "transcription:auto": ["com.veiller.ai"],
        "location_stream": ["com.example.dev"],
      },
    })

    const context = buildMiniappDiagnosticContext({
      apps,
      foregroundedPackage: "com.veiller.ai",
      runtime: runtimeSnapshot,
      getLastOpenedAtMs: (candidate) =>
        candidate.packageName === "com.veiller.notes" ? 300 : candidate.packageName === "com.veiller.ai" ? 200 : 100,
      getManifest: (candidate) =>
        candidate.packageName === "com.veiller.ai"
          ? {packageName: candidate.packageName, version: candidate.version, sdkVersion: "0.3.0"}
          : undefined,
      getReleaseIdentity: (candidate) =>
        candidate.packageName === "com.veiller.ai"
          ? {source: "preinstalled_registry", bundleSha256: "abc123", channel: "stable", ignored: "no"}
          : undefined,
    }) as {
      running: string[]
      foregroundedPackage: string
      mostRecentlyInteractedPackage: string
      recentlyInteracted: Array<{packageName: string}>
      runningMiniapps: Array<Record<string, unknown>>
    }

    expect(context.running).toEqual(["com.veiller.ai", "com.example.dev"])
    expect(context.foregroundedPackage).toBe("com.veiller.ai")
    expect(context.mostRecentlyInteractedPackage).toBe("com.veiller.notes")
    expect(context.recentlyInteracted.map((recent) => recent.packageName)).toEqual([
      "com.veiller.notes",
      "com.veiller.ai",
      "com.example.dev",
    ])
    expect(context.runningMiniapps[0]).toMatchObject({
      packageName: "com.veiller.ai",
      version: "1.4.9",
      executionMode: "installed_bundle",
      foregrounded: true,
      manifest: {packageName: "com.veiller.ai", version: "1.4.9", sdkVersion: "0.3.0"},
      releaseIdentity: {source: "preinstalled_registry", bundleSha256: "abc123", channel: "stable"},
      runtime: {handshakeComplete: true, subscriptions: ["button_press", "transcription:auto"]},
    })
    expect(context.runningMiniapps[1]).toMatchObject({
      packageName: "com.example.dev",
      version: "0.4.0",
      executionMode: "dev_server",
      manifest: {
        packageName: "com.example.dev",
        version: "0.4.0",
        sdkVersion: "0.3.0",
        actionIds: ["dev_action"],
      },
    })
  })
})
