# R1 Ring — Capture #1 Findings (the make-or-break spike result)

> Date: 2026-06-25. Source: one HCI-snoop capture session on the real Even app.
> Phone: Samsung Galaxy S25 Ultra (SM-S938U), Android 16. Capture armed in
> **FULL** snoop mode; payloads are plaintext (below link-layer encryption).
> Raw artifacts (`r1-capture.zip`, `r1-btsnoop.log`) are git-ignored — they
> contain private device data. Decode script: `tools/r1-decode-ring.py`.
> Timeline: `r1-timeline.txt`.

## Headline verdict (scope updated 2026-06-25 after owner review)

**Ring control is native firmware; we don't need to decode it. The ring's only
phone-direct workstream is health.** This capture answered the make-or-break
question and the answer reshapes the goal rather than killing it.

Two facts together:

1. **The ring does not send button/gesture events to the phone over BLE.** During
   25 deliberate presses (tap/double-tap/long-press/slide-up/slide-down ×5 each,
   isolated + timestamped) the ring↔phone link was **silent** — a 7-minute,
   zero-packet gap (10:19:33 → 10:26:29). Gestures travel only over the
   **ring↔glasses** link (research doc open question #1: *answer = only
   ring↔glasses*).
2. **The glasses translate ring input into their own native input events.** The
   one ring gesture that surfaced to the phone (double-tap) arrived as
   `gesture_ctrl: dashboard closed` — the **same** event the G2 temple touchpad
   emits. The firmware maps ring presses onto existing glasses controls.

**Therefore (owner decision):** we do **not** need to capture or decode ring
gesture data. Since we already drive the G2 and receive its native input events
(the MentraOS baseline, goal #2), ring control "comes for free" — keep the ring
**bound to the glasses** and consume the same G2 input-event stream the glasses
already produce. The ring will do whatever the glasses' button/touch input is
already programmed to do. Goal #1 narrows to: **(a) confirm/maintain the
ring↔glasses binding** (a G2-protocol concern, inherited), and **(b) health
metrics** (the only original ring-BLE RE, and it is decodable — see below).

## What was positively confirmed

- **Topology / UUIDs match the research doc exactly.** The ring (`EVEN R1_F8B663`,
  BLE addr `DD:52:92:F8:B6:63`) is bonded **directly to the phone**, service
  `BAE80001-4F05-4503-8E65-3AF1F7329D1F`, write char `BAE80012-…` (GATT handle
  `0x0015`), notify char `BAE80013-…` (handle `0x0017`, CCCD `0x0018` enabled with
  `0100`). MTU 247. App config name `ring_bcl_1`.
- **The G2 is two BLE devices** (dual-radio): `Even G2_32_L_153CE5`
  (`C8:5F:91:15:3C:E5`) and `Even G2_32_R_819735` (`D4:E9:AF:81:97:35`), using the
  Nordic-UART-style `…2760…5450/6450/7450/1001` service family (matches
  `i-soxi/even-g2-protocol`). Their heavy `aa12…` notification stream is almost
  entirely **keepalive / DevSettings polling and periodic dashboard refreshes**,
  not ring events.
- **The Even app's own verbose logs are in the bug report** (React-Native "CORE:"
  + Flutter `EvConnect` logs). This is a major bonus source — it labels devices,
  prints BLE configs, and logs semantic events.

## What the ring↔phone link actually carries

A slow request/response poll on `0x0015`→`0x0017`, roughly every 1–2 min, plus a
burst at connect and a burst during the manual health sync. Frame skeleton
(little-endian, observed):

```
00 | <4-byte rolling value> | 6402 | <seq byte> | <dir: 0000=req / 0003=resp> | 00 | <cmd> | <len16> | <payload...> | <2-byte CRC>
```

- **Health sync (10:26:29 burst)** issued commands `cmd = 01,02,04,05,06`, each
  answered with 12-byte payloads, plus a 42-byte record (`…0210ffc0a73c6a3d…`).
  So the **health request/response wire format is observable and decodable** with
  focused work (goal #1b). GoMore-key gating on derived metrics is still untested.
- **Connect burst (10:14:46)** returned device-info frames containing **plaintext
  serial/model strings** (e.g. `B290DHACE160024`, `21059YHSBNN260321129…`).
- A 24-byte `cmd=0f` status frame is polled every ~1–2 min (value field changes:
  `8888 / 5495 / 4444 …` — likely a status/sensor counter).

## What the phone learned about gestures (almost nothing)

- The only gesture signal that reached the phone was `gesture_ctrl response:
  dashboard closed` — and **only during the double-tap batch** (3 events,
  10:22:58–10:23:15). These came over the **G2 link**, not the ring.
- **Tap, long-press, slide-up, slide-down produced zero phone-visible events** on
  any link. No app log named any specific ring gesture.
- Interpretation: the glasses consume ring input locally (menu nav on-gl, etc.)
  and only surface a coarse "dashboard toggled" event to the host. Rich
  per-gesture input is not exposed to the phone by the stock Even app's path.

## The binding / "confirm ring is connected to glasses" mechanism

The host manages the ring↔glasses relationship over the **G2 link** (the
`…2760…` Nordic-UART services we inherit), not over the ring link. Observed in the
Even app logs:

- `[protoBaseSettings] switchRingHand: isLeft=true, mac=DD:52:92:F8:B6:63,
  result=BleCmdStatus.success` — a host→glasses command that configures the ring
  binding, parameterized by the ring's BLE MAC and which hand.
- `[EvConnect:BleG2Service] Ring bind status: BleGlassesRingBindStatus.hadBound`
  (polled continuously) — the glasses report binding state back to the host, so
  "is a ring bound?" is a host-side query.
- `[Health][HealthSync] ringConnected: trigger fetchAllHistoryDataFromRing` — the
  health pull is triggered off ring-connected state and fetched over the ring's
  `BAE80012/13` link.

(Ignore the Samsung `RingConnectionManager` / `com.samsung.wearable.watch6plugin`
lines in the bug report — that's Samsung Health's term for the Galaxy Watch, not
the Even R1.)

So the remaining work to map out: which exact G2-protocol opcodes carry
`switchRingHand` / bind-status, and whether MentraOS already exposes them or we add
them as an additive G2 command. This is **inherited-stack** work, not original RE.

## Remaining ring workstreams (post-scope-change)

1. **Binding confirmation (control path, inherited).** Find the G2-protocol
   command/notification for ring bind-status + `switchRingHand` and surface
   "ring bound? yes/no" in Foverlay. Verify ring gestures arrive as normal G2
   input events under MentraOS so our custom UI can act on them. No ring decode.
2. **Health decode (the only original RE).** We already captured the request/
   response frames (cmd bytes `01/02/04/05/06`, 12-byte payloads, plaintext serial
   at connect). Next: a targeted health-only capture (manual sync + known on-screen
   values if available) to map each cmd→metric and test the GoMore-key gate on
   derived metrics (HRV/sleep/SpO2). Route results to Health Connect (goal #5).

## Recommended next step

No further *gesture* capture is needed. Next is a **health-focused capture +
decode**: wear the ring, force a manual sync (ideally with a visible HR/step value
to anchor the encoding), and map the `0x0015→0x0017` command bytes to metrics.
Binding/control validation happens against the **G2 stack** once the MentraOS fork
is up, since that's where ring input now lands.

## Reproduce

```bash
# extract snoop log from the bug report, then:
python tools/r1-decode-ring.py        # dumps all ring (conn 0x000a) ATT activity
```
The decode script keys on the ring's connection handle (`0x000a` in this capture);
for a new capture, find the ring's handle from the LE Connection Complete event
for addr `DD:52:92:F8:B6:63` (or grep the bug report's `BleManager::Start connect`
log line) and update `RING_CONN`.
