# Getting Started — Run Your First R1 Ring Capture

This is the start-to-finish walkthrough for the project's **first and most
important task**: capturing the real Even app's Bluetooth traffic to the R1 ring
so we can decode it.

- **Why this matters:** the R1 ring is make-or-break (see
  [`r1-ring-research.md`](./r1-ring-research.md)). One capture answers the question
  the whole project hinges on: *do the ring's button presses show up on the phone
  link in a form we can decode?* If yes → the project is viable and we fork
  MentraOS. If no → we learned that for the cost of a ~15-minute session instead of
  a full build.
- **Deep reference:** the detailed rationale and fallbacks live in
  [`r1-ring-capture-guide.md`](./r1-ring-capture-guide.md). This page is the quick,
  do-it-now version.

---

## What this session produces

Two files you hand back for decoding:

1. `r1-capture.zip` — an Android bug report containing the **Bluetooth HCI snoop
   log** (the captured ring traffic).
2. `r1-timeline.txt` — a timestamped list of exactly what you did and when,
   generated for you by the helper script.

> **Why an HCI snoop log and not a hardware sniffer?** The snoop log records
> packets between the phone's host stack and its Bluetooth controller — *below* the
> controller's link-layer encryption. So even though the ring↔phone air link is
> encrypted, the log captures the **plaintext** ATT/GATT payloads. No root, no
> sniffer hardware needed.

---

## Step 0 — Gather (2 min)

Have these in hand:

- [ ] The **Android phone** bound to your R1 + G2, with the **official Even app**
      installed and working (ring reporting health normally).
- [ ] A **computer with `adb`** (Android Platform Tools) and a **USB cable**.
- [ ] The **ring on your finger** — the health sensors need skin contact, or
      readings come back as zeros.

**Verify `adb` works:** plug the phone in and run:

```bash
adb devices
```

If your phone is listed, you're set. If `adb` isn't installed:

- **macOS:** `brew install android-platform-tools`
- **Linux (Debian/Ubuntu):** `sudo apt install android-tools-adb`
- **Windows:** download "SDK Platform Tools" from Google and run `adb` from that
  folder (or use it inside WSL / Git Bash).

The first time you connect, the phone shows an "Allow USB debugging?" prompt —
tap **Allow**.

---

## Step 1 — Arm the capture on the phone (3 min)

1. **Settings → About phone →** tap **Build number** 7 times to unlock Developer
   options.
2. **Settings → System → Developer options →** turn on **USB debugging**.
3. Same screen → set **Enable Bluetooth HCI snoop log** to **Full** (some phones
   just say *Enabled*).
4. **Toggle Bluetooth OFF, then ON.** ← Easy to forget, and required: the log only
   begins recording after the Bluetooth stack restarts.

> Optional: if you want the pairing/bonding handshake in the capture too, unpair
> the ring in the Even app first, then do steps 3–4, then re-pair during Step 2.
> Not required (payloads are plaintext regardless), but it helps confirm nothing is
> obfuscated above the link layer.

---

## Step 2 — Run the guided session (~10 min)

The helper script walks you through each action and **stamps the exact time** of
every gesture batch into `r1-timeline.txt`, so the captured packets can be aligned
with what you did. It does **not** touch the phone — you drive the ring/app by
hand; the script only records timing.

**Before running:** keep the phone and the computer **both on automatic network
time** so their clocks agree (we only need ~1–2s accuracy because actions are
spaced out).

From the repo:

```bash
bash tools/r1-capture-session.sh
```

It will have you:

1. **Idle baseline** — sit still 30s, doing nothing. (Lets the decode filter out
   keep-alive/poll traffic.)
2. **Gestures (the priority)** — for **each** gesture your ring supports, do it
   **5 times, ~3s apart**, with a pause between gesture *types*. Make the G2 visibly
   react if you can, so we know the gesture registered. For the R1 these are tap /
   double tap / long press / slide up / slide down (already set in the script's
   `GESTURES` list — edit it there if your inputs differ).
3. **Health sync** — trigger a manual sync or open the health screen and wait ~30s.
   If a live heart rate shows on screen, type it in when prompted — a known value
   makes the encoding much easier to find.
4. **Wear off/on** (optional) — surfaces the wear-detection event.

Keep it clean: 5 crisp, isolated repetitions beat 50 messy ones.

---

## Step 3 — Pull the capture (1 min)

With the phone still connected by USB:

```bash
adb bugreport r1-capture.zip
```

The snoop log is bundled inside that zip (around
`FS/data/misc/bluetooth/logs/btsnoop_hci.log`). Don't worry about digging it
out — hand over the whole zip and it gets extracted during decode.

> **Privacy note:** a full bug report contains unrelated device/system info. If
> you'd rather not share all of it, the snoop log alone can be extracted from the
> zip — ask and you'll get told exactly which single file to pull. The snoop log is
> the only thing actually needed.

---

## Step 4 — Hand it back, then disarm

Provide both:

1. `r1-capture.zip` (or the extracted `btsnoop_hci.log`).
2. `r1-timeline.txt` (the script wrote this for you).

Then **turn the snoop log back off**: Developer options → set **Enable Bluetooth
HCI snoop log** to **Disabled**, and toggle Bluetooth off/on. Otherwise the phone
logs all Bluetooth traffic continuously.

---

## What happens next (the decode)

The captured log gets opened in Wireshark, filtered to the ring's `BAE8xxxx`
handles, and aligned against your timeline to answer, in order:

1. **Do gesture events arrive on the ring↔phone link at all?** (This single fact
   decides the architecture — it's the true make-or-break.)
2. **Can tap vs. scroll vs. long-press be decoded from the bytes?**
3. **What does the health response look like, and is it gated behind GoMore
   algorithm keys?**

That is your viability verdict. If gestures decode over a path we can reach, we
proceed to fork MentraOS for the glasses baseline and build the ring as a native
Android module. If they don't, that's the early stop signal — at minimal cost.

## Troubleshooting

- **`adb devices` shows nothing / "unauthorized":** check the cable supports data,
  confirm USB debugging is on, and accept the "Allow USB debugging?" prompt on the
  phone.
- **Health values come back as zeros:** the ring almost certainly needs to be worn
  with good skin contact during the session — re-run with the ring snug on a
  finger.
- **Snoop log looks empty / tiny:** you likely didn't toggle Bluetooth off/on after
  enabling the log (Step 1.4). Re-arm and redo.
- **Payloads look like ciphertext (unexpected):** see the fallbacks in
  [`r1-ring-capture-guide.md`](./r1-ring-capture-guide.md) (nRF52840 sniffer, or
  static analysis of the decompiled app's `ring1/` protobuf definitions).
