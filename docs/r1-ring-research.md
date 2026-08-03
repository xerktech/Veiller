# R1 Ring — Feasibility Research (the make-or-break item)

> **Partially superseded (2026-06-25):** this is the *pre-capture* feasibility
> analysis. Capture #1 has since answered the key open question — ring control is
> native (no RE needed) and only health needs decoding. Read
> `docs/r1-ring-capture-findings.md` for the current scope; the sections below
> remain useful for the health-decode plan and the GoMore risk.

> Status: research notes, 2026-06-25. This is the single highest-risk dependency
> in Foverlay. Per the project owner: **if the R1 ring can't be made to work
> (health metrics + button-press control of the G2), the whole project is a wash.**
> That makes the ring priority #1, *ahead of* the glasses-only milestone — which
> is a deliberate re-prioritization away from CLAUDE.md §4/§9 (where the ring was
> listed as out-of-scope / a future sub-project). CLAUDE.md should be updated to
> match; see "Recommended scope change" below.

## TL;DR verdict

The ring is **plausible but unproven** and is **original reverse-engineering work**,
not an integration. No public, working R1 protocol exists. MentraOS supports the
G2 glasses but **does not support the R1 ring at all** — so the ring gives us
nothing to inherit from our fork base. The most-advanced public effort
(openCFW `ring1/`) has identified the BLE service/characteristics and scraped
health *method names* from the decompiled app, but the **command/packet byte
format for both health queries and button/gesture events is still UNKNOWN**, and
speculative probes returned zero data.

Bottom line: getting the ring working means we do the RE that nobody has finished
yet. It is tractable (the ring exposes a real BLE link to the phone, standard
Nordic stack), but it is a research project with a real chance of failure, and it
should be de-risked *first* with a cheap spike before committing to the full fork.

## Connection topology (this is the good news)

- The R1 connects **directly to the phone over BLE**, independently of the
  glasses. There is a distinct "App ↔ R1" pairing (Even support has a dedicated
  "App And R1 Connection Failure" article), separate from the "G2 ↔ R1" pairing.
- A single R1 binds to **one phone + one pair of G2**. Health works offline and
  syncs to the phone when reconnected.
- The glasses can also act as a relay / discovery helper (`UX_RING_DATA_RELAY_ID`,
  `openRingBroadcast`, `switchRingHand(isLeft)`), but the phone has its own direct
  link.

**Why this matters:** because the phone talks BLE to the ring directly, *we* can
talk to it directly too — and we can capture the real Even app's traffic to the
ring (Android HCI snoop log, or an nRF52840 sniffer). That is the entire opening.
We are not blocked by an air-gap.

## What's known about the ring BLE surface (from openCFW `ring1/`)

Service / characteristics (proprietary `BAE8xxxx` family):

| UUID | Role |
|------|------|
| `BAE80001-…` | Ring service (base family) |
| `BAE80012-…` | Ring **TX** — phone → ring (write commands) |
| `BAE80013-…` | Ring **RX** — ring → phone (notify; health + likely gesture events) |
| `FE59` | Nordic Buttonless Secure DFU (SIG-registered) |
| `DA2E7828-FBCE-4E01-AE9E-261174997C48` | SMP / MCUmgr (Nordic DFU data transfer) |
| `1800` / `1801` | Generic Access / Attribute |

- Payloads use protobuf (`BleRing1CmdProto` / `BleRing1CmdHealthExt`).
- Firmware OTA is **standard Nordic SMP** (`iOSMcuManagerLibrary` / `NordicDFU`),
  not the G2's custom signed-OTA path. So the ring is a fairly conventional Nordic
  device underneath — friendlier to sniff/probe than the glasses.

## What is NOT known (the actual work)

- **Gesture/button event packet format — UNKNOWN.** Method/strings confirm
  gestures exist, but no decoded event packets. This is the crux of "use ring
  button presses to control the glasses." Must be sniffed off `BAE80013`.
- **Health command byte format — UNKNOWN.** Method *names* were scraped from the
  binary (`getDailyData`, `getWearStatus`, `setHealthEnable`, `ackNotifyData`,
  `getAlgoKeyStatus`/`setAlgoKey`), but not their wire encoding. Speculative
  probes (#37-39) returned `00 00` (zero data) — possibly because the ring
  requires active wear/skin contact to emit readings, possibly wrong framing.
- **GoMore algorithm keys (`getAlgoKeyStatus` / `setAlgoKey`) — RISK.** The health
  metrics (HRV, sleep stages, etc.) appear to be derived by a licensed **GoMore**
  algorithm gated behind a key provisioned into the app/ring. Even if we read raw
  PPG/accelerometer data, the *derived* metrics may be unobtainable without that
  algorithm. Raw HR/steps are likely recoverable; HRV/sleep/SpO2 quality may not be.

## Two distinct sub-goals, different difficulty

1. **Button/gesture control of the G2 (likely easier, and the true make-or-break).**
   We need: phone subscribes to ring RX notifications, decode the gesture event
   bytes, map them to G2 display/scroll commands (which MentraOS already drives).
   This is a small, well-bounded decode problem if the events come over the
   phone link. **Open question to resolve first:** do button presses traverse the
   ring↔phone link at all, or *only* the ring↔glasses link? If the latter, we'd
   need the G2 to forward them to the phone — verify early.
2. **Health metrics (harder, partially gated).** Raw counters (steps, instantaneous
   HR) are probably reachable; GoMore-derived metrics may be blocked. Health Connect
   remains the destination for whatever we extract (per CLAUDE.md §3).

## Reference material (ranked by usefulness for the ring)

- **`kalanihelekunihi/evenRealities-openCFW`** → `docs/firmware/even-app-reverse-engineering.md`
  — the only public source with a `ring1/` layer. Has the UUIDs above and the
  health method-name list. Most valuable starting point. Command bytes unknown.
- **`i-soxi/even-g2-protocol`** — G2 glasses only; **no ring content at all**.
  Useful for the glasses side, irrelevant to the ring decode.
- **`backengineering/ring-1.io`** — NOTE: this is unrelated (a software product
  named "Ring-1.io"), not the Even R1. Do not confuse it.
- Even support center (R1 category) — UX/topology facts (pairing, offline sync,
  one-phone-one-glasses binding), no protocol.

## Recommended approach: de-risk the ring BEFORE the full fork

A cheap spike answers "is this a wash?" without building the whole app:

1. **Capture ground truth.** Pair the real Even app + R1 + G2 on an Android phone,
   enable Bluetooth HCI snoop log, perform each gesture and a health sync, pull the
   `btsnoop_hci.log` and read it in Wireshark. This gives us *real* `BAE80012` writes
   and `BAE80013` notifications — the data openCFW never finished decoding.
2. **Confirm the control path.** Determine whether gesture events appear on the
   ring↔phone link (great) or only ring↔glasses (need relay). This single fact
   decides the architecture.
3. **Decode gestures first.** Smallest payload, most repeatable, and it's the
   actual make-or-break capability. Map tap/scroll/long-press to bytes.
4. **Then probe health.** Replay `getDailyData`-style writes; check whether
   readings need active wear; assess the GoMore-key gate for derived metrics.
5. **Only then** commit to wiring it into the MentraOS fork as a native Android
   ring module (the phone host app already owns BLE on Android).

If steps 1-3 fail to yield decodable gesture events over a path we can reach, that
is the early "wash" signal — and we'll have spent a sniffing session, not a fork.

## Recommended scope change to CLAUDE.md (flagging the drift)

CLAUDE.md currently (§4, §9) treats the ring as out-of-scope and a future,
separable BLE sub-project, and says "Don't entangle initial architecture with ring
assumptions." The owner's current direction inverts this: the ring is priority #1
and make-or-break. Suggested edits (pending owner OK):

- §3 Goals: add the ring as goal #1 (health metrics + button control), demote the
  glasses-only milestone to the enabling step beneath it.
- §4 Non-goals: remove the R1 ring from non-goals; keep iOS, store-publishing,
  and BLE-stack-rewrite as non-goals.
- §9: reframe from "future sub-project" to "active, highest-priority RE workstream"
  and link this doc.

## Open questions to resolve in the spike

- Do button/gesture events traverse ring↔phone, or only ring↔glasses?
- Is ring↔phone BLE encrypted/bonded in a way that obscures the snoop log payloads?
- Does the ring gate health output behind GoMore keys we can't obtain, and if so
  which metrics survive (raw HR/steps) vs which don't (HRV/sleep/SpO2)?
- Does MentraOS's Android BLE layer leave room for a second concurrent GATT
  connection (the ring) alongside the G2, or does it assume a single device?
