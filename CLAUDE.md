# CLAUDE.md — Foverlay

Context for any Claude agent working in this repository. Read this fully before
planning or writing code. When this file and the actual codebase disagree, the
codebase wins — but tell me about the drift so I can update this file.

---

## 1. What Foverlay is

Foverlay is a custom Android companion app for **Even Realities G2 smart glasses**.
It replaces the stock Even Realities app as the *host* / connection point for the
glasses, giving me a fully custom dashboard and UX plus deep native phone
integration the stock app and the Even Hub plugin sandbox can't provide.

The name: **fovea** (the sharp-focus center of vision) + **overlay** (what a HUD
draws). It is not affiliated with Even Realities or Mentra — keep both trademarks
out of the product identity, package names, and user-facing strings.

### The core decision: fork MentraOS, do not build BLE from scratch

We are building Foverlay as a **fork of MentraOS** (`Mentra-Community/MentraOS`,
MIT-licensed), NOT a from-scratch BLE host. MentraOS already implements the hard
parts on Android: G2 pairing, connection management, display, microphone, touch
gestures, battery, and brightness. Re-deriving the BLE/protobuf/audio stack
ourselves would be months of work for no benefit. The plan is to inherit
MentraOS's glasses plumbing and replace the parts above it (dashboard, UX,
permissions, backend hosting).

If an approach starts to look like "reimplement what MentraOS already does," stop
and reconsider — that's almost always the wrong path here.

## 2. Current status

Greenfield. Treat the repo as a fresh fork of MentraOS that has not yet been
customized. Early tasks are about **planning and isolating** our changes so we can
keep rebasing on MentraOS upstream, not about large rewrites.

## 3. Goals (in priority order)

> **Priority override (2026-06-25):** the **R1 ring is now goal #1 and is
> make-or-break** — if we can't get the ring working (health metrics + ring
> button-press control of the G2), the whole project is a wash, so it is proven
> out *before* anything else. This deliberately supersedes the earlier framing
> (and §9) where the ring was a deferred sub-project. See
> `docs/r1-ring-research.md` for the feasibility analysis and the de-risk plan.
> The ring requires original BLE reverse-engineering; MentraOS does **not**
> support it, so the fork gives us nothing to inherit here.

1. **R1 ring (make-or-break, do first).** Decode the ring's BLE protocol enough to
   (a) receive ring button/gesture events and use them to control the G2, and
   (b) read health metrics (route on-device into Health Connect, see goal #5).
   The ring pairs directly to the phone over BLE, so we sniff the real Even app's
   traffic and decode it. If this can't be made to work, stop the project.
2. **Glasses baseline (enabling step for the ring milestone and everything else).**
   Connect to the G2, verify microphone input and screen/text output. This is the
   foundation the ring control loop renders onto; it comes from the MentraOS fork.
3. **Custom dashboard / UX.** Replace MentraOS's default dashboard/home experience
   with my own glanceable layout and widget system on the glasses.
4. **Native phone integrations** that the Even Hub sandbox blocked:
   - **Calendar** via Android `CalendarContract` (local device calendar, which
     already includes synced Google calendars) — no OAuth, no per-user API keys.
   - **Fitness** via **Health Connect** (on-device). Note the cloud path is dead:
     the Google Fit REST API is deprecated and shutting down end of 2026 with no
     replacement, so local Health Connect is the only real option. This is also
     where ring health metrics (goal #1b) land.
   - **Messaging** via Android default-SMS-handler APIs (see constraints below).
5. **Self-hosted backend.** Run our own MentraOS backend rather than MentraOS
   Cloud, both for privacy and to fit my existing self-hosting setup (home lab,
   reverse proxy via Cloudflare Tunnel / `cloudflared`; no Tailscale).
6. **Android first.** iOS is explicitly later.

## 4. Non-goals / out of scope (for now)

- **iOS support.** Deferred. Do not let iOS constraints shape Android decisions.
- **Rewriting MentraOS's BLE / protobuf / audio / ASR layers.** Inherit them.
  (Note: this applies to the *G2 glasses* stack we inherit. The *R1 ring* has no
  MentraOS support and is in scope as original RE — now goal #1, see §3/§9.)
- **Publishing to the Mentra or Even app stores.** This is a private host app.

## 5. Architecture (inherited from MentraOS)

The MentraOS data path:

```
G2 glasses  <--BLE-->  phone (host app)  <-->  backend  <-->  app servers (MentraOS SDK)
```

- **Phone host app**: React Native (Expo) with native Android/iOS modules. This is
  where our custom dashboard and native-permission bridges live.
- **Backend**: TypeScript services. We self-host this.
- **App servers / mini-apps**: MentraOS uses a mini-app model — apps run as servers
  speaking the MentraOS SDK, and multiple mini-apps share one glasses connection
  through the on-phone runtime. Foverlay features can be implemented either as
  native host features or as mini-apps; decide per feature during planning.

SDK shape (for orientation, verify against the installed version):

```ts
import { AppServer } from '@mentra/sdk'
class MyApp extends AppServer {
  protected async onSession(session, sessionId, userId) {
    session.layouts.showTextWall("Hello")
    session.events.onTranscription((data) => { /* ... */ })
  }
}
```

## 6. Tech stack

- **Mobile host**: React Native + Expo (TypeScript) with native modules in Kotlin
  (Android) — Android is where calendar / Health Connect / SMS bridges get written.
- **Backend**: TypeScript (self-hosted).
- **Glasses transport**: BLE, handled by MentraOS — we should not need to touch raw
  GATT for G2 unless we hit a MentraOS gap.

## 7. Repo layout (from MentraOS — VERIFY against the real tree)

MentraOS's own `AGENTS.md` describes roughly this structure. Do not trust it
blindly; run a directory listing and read the real `AGENTS.md` / module-level docs
before planning against it:

- `mobile/` — Expo React Native host app (our dashboard + native bridges)
- `cloud/packages/` — backend services, TS SDK, store frontend
- `cloud/tests/` — integration tests
- `android_core/`, `android_library/`, `sdk_ios/` — platform SDKs / native code
- `mcu_client/` — hardware/MCU tooling
- `agents/`, `docs/` — notes and design docs

Before editing, locate the **dashboard/home** module in `mobile/` — that's the
primary surface we're replacing.

## 8. Platform constraints the agent MUST respect

These are hard realities; don't plan around them as if they're solvable in code:

- **iOS SMS is impossible.** iOS does not allow third-party apps to send SMS
  silently, read the inbox, or become the default messaging app. The most iOS ever
  allows is a pre-filled compose sheet the user taps. This is one reason messaging
  is Android-first.
- **Android SMS is permission-gated by Google Play.** We can become the default SMS
  handler and read/send, but the `SMS`/`CALL_LOG` permission group requires
  qualifying for a permitted use case (default handler is one) and passing Play
  review. Plan messaging so the app degrades gracefully if SMS permission isn't
  granted.
- **Calendar and fitness are local, not cloud.** Use `CalendarContract` and Health
  Connect. Do not introduce OAuth flows or require users to generate API keys for
  these — avoiding exactly that friction is a core reason this app exists.
- **Self-hosted backend** means don't hardcode MentraOS Cloud endpoints; everything
  cloud-facing must be configurable to point at my own host.

## 9. R1 ring (HIGHEST-PRIORITY workstream — make-or-break, see §3 and `docs/r1-ring-research.md`)

The Even R1 ring controls the G2 (tap/scroll/long-press) and tracks HR, SpO₂, HRV,
sleep, steps, skin temp. **This is now goal #1: if the ring can't be made to work,
the project is a wash, so we prove it out first.** MentraOS does not support the
ring, so this is original BLE reverse-engineering — nothing to inherit from the fork.

What we've established (full detail in `docs/r1-ring-research.md`):

- **Topology:** the ring pairs **directly to the phone over BLE** (separate from the
  ring↔glasses link), so we can talk to it *and* sniff the real Even app's traffic.
  Service `BAE80001`, TX (phone→ring) `BAE80012`, RX (ring→phone notify) `BAE80013`,
  protobuf payloads (`BleRing1CmdProto`), standard Nordic SMP for firmware.
- **What's unknown (the work):** the gesture/button event packet format and the
  health command byte format are both undecoded publicly; the openCFW `ring1/`
  effort scraped method names (`getDailyData`, etc.) but not wire formats.
- **Risks:** (1) confirm button events traverse ring↔phone (not only ring↔glasses);
  (2) health metrics may be gated behind licensed **GoMore** algorithm keys — raw
  HR/steps likely recoverable, HRV/sleep/SpO₂ may not be.
- **Plan:** de-risk with a BLE sniffing spike (HCI snoop log → Wireshark) *before*
  the full MentraOS fork; decode gestures first (the true make-or-break), then probe
  health. Implement as an isolated native Android ring module, kept upstream-mergeable.

## 10. Reference material

- **`Mentra-Community/MentraOS`** — our fork base. Source of truth for architecture,
  module layout, SDK, and how G2 is driven. Read its `AGENTS.md` and module docs.
- **`i-soxi/even-g2-protocol`** — community G2 BLE reverse engineering. Useful if we
  ever hit a MentraOS gap. Has: 7-packet auth handshake, teleprompter text, calendar
  widget; notifications partial; AI/navigation still research. Details: CRC-16/CCITT
  (init `0xFFFF`, poly `0x1021`, little-endian, computed over payload only); packet
  `[AA][21][seq][len][01][01][svc_hi][svc_lo][payload][crc_lo][crc_hi]`; dual channel
  — content `0x5401`, rendering `0x6402`; protobuf payloads.
- **`AGiXT/mobile`** — documents the related G1 BLE protocol (dual BLE radios, one per
  arm, Nordic UART). Good background for the Even protocol family.
- **`kalanihelekunihi/evenRealities-openCFW`** — decompile/RE notes on the Even iOS
  app internals (incl. the `ring1/` ring layer reference).
- **even-g2-notes** (community) — G2 architecture, BLE/session, display, input, page
  lifecycle, device API, packaging docs, plus example apps.

## 11. Conventions / how to work in this repo

- **Read the real MentraOS code before planning against it.** It moves fast; this
  file is a map, not the territory.
- **Keep changes upstream-mergeable.** Maintain a clean `upstream` remote pointing at
  `Mentra-Community/MentraOS`. Isolate Foverlay-specific code so we can rebase on
  upstream without painful conflicts. Prefer additive modules over rewriting MentraOS
  internals in place; when we must modify upstream files, keep edits minimal and
  well-commented.
- **No Even / Mentra trademarks** in product name, package IDs, or user-facing copy.
- **Respect MentraOS's MIT license** (retain notices) in anything we redistribute.
- **Android first**: when a design choice trades Android quality for iOS readiness,
  favor Android.

## 12. How to approach planning (what I usually want from you)

When asked to plan, produce a written plan **before** writing code:

1. State your understanding of the task and how it fits the goals in §3.
2. Identify which MentraOS module(s) are involved and what you actually found when
   you inspected them (don't assume from §7).
3. Decide: native host feature vs. mini-app, and why.
4. Call out platform constraints (§8) and how the design handles them, including the
   graceful-degradation path when a permission is denied.
5. List concrete steps / file changes, the upstream-mergeability impact, and how it
   gets tested.
6. Flag open questions and anything you couldn't verify rather than guessing.

Ask before large refactors of inherited MentraOS code. Small, isolated, reversible
changes are preferred.

## 13. Open questions to verify (not assume)

- Exact current MentraOS module layout and where the dashboard/home surface lives.
- Whether the installed MentraOS version exposes the hooks we need for a fully custom
  dashboard, or whether we need to patch upstream.
- Current `@mentra/sdk` surface and the supported way to render custom widgets/layouts
  on the G2.
- The precise self-hosting steps for the MentraOS backend and which endpoints the
  mobile app must be repointed to.
- Health Connect + `CalendarContract` integration points within the Expo/native-module
  boundary.
