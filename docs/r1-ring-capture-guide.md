# R1 Ring — BLE Capture Guide (do this first)

Goal: capture the **real Even app's Bluetooth traffic to/from the R1 ring** so we
can decode (1) ring button/gesture events and (2) health queries. This is the
make-or-break spike — see `docs/r1-ring-research.md`.

**Method: Android Bluetooth HCI snoop log.** This is the right tool here, not an
over-the-air sniffer. The HCI snoop log records packets between the phone's host
stack and its Bluetooth controller — which sit **below** the controller's
link-layer encryption. So even though the ring↔phone air link is encrypted, the
snoop log captures the **plaintext ATT/GATT payloads**. An nRF over-the-air sniffer
would only see ciphertext unless it also caught the pairing. No root required.

You provide: the `btsnoop_hci.log` (or a `bugreport.zip`) plus the action timeline
below. I decode it.

---

## What you need

- The Android phone bound to your R1 + G2, with the **official Even Realities app**
  installed and working (ring already paired and reporting health normally).
- A computer with `adb` (Android Platform Tools) and a USB cable.
- ~20 minutes.

## Step 1 — Enable Developer Options + HCI snoop log

1. Settings → About phone → tap **Build number** 7 times to unlock Developer
   Options.
2. Settings → System → **Developer options**.
3. Turn on **USB debugging** (so `adb` works).
4. Find **Enable Bluetooth HCI snoop log** and set it to **Enabled** (on some
   phones the choices are *Disabled / Filtered / Full* — choose **Full**).
5. **Toggle Bluetooth OFF then ON.** The snoop log only starts capturing after the
   stack restarts, so this is required to begin a clean capture.

> Tip: if you want the *pairing/bonding* handshake in the capture too, first
> **unpair the ring** in the Even app, then do step 4–5, then re-pair during the
> session below. Not strictly required (payloads are plaintext regardless), but it
> helps confirm whether anything is obfuscated above the link layer.

## Step 2 — Run the action session (keep a timeline)

The decode depends on correlating packets to actions, so do each action
**deliberately, in isolation, repeated, with pauses**, and **write down the
wall-clock time** (HH:MM:SS) of each. Phone clock is fine. Narrating each action
out loud into a voice memo with timestamps also works and is faster.

Wear the ring (health sensors need skin contact — earlier probes returned zero
data when not worn). Then, with the Even app open and connected:

1. **Idle baseline** — sit still 30 s, do nothing. (Lets me see keep-alive/poll
   traffic so I can filter it out.) Note start/end time.
2. **Gestures — the priority.** For EACH distinct gesture the ring supports, do it
   **5 times with ~3 s between each**, and pause ~10 s between gesture *types*.
   The R1's inputs are:
   - tap
   - double tap
   - long press
   - slide up
   - slide down
   For each, ideally make the G2 visibly react (scroll a menu, select, etc.) so we
   know the gesture "took". Record the time of each batch.
3. **Health sync.** Trigger a manual health sync/refresh in the Even app if it has
   one; otherwise open the health/insights screen and wait ~30 s for it to pull
   HR/SpO₂/steps. Note the time. If you can get a *live HR reading* on screen,
   note the displayed value + timestamp — a known value helps me find the encoding.
4. **Wear on/off (optional but useful).** Take the ring off for ~10 s, put it back
   on. This surfaces the wear-detection event.

Keep the session short and the labels clean — 5 crisp repetitions beat 50 messy
ones.

## Step 3 — Pull the capture

With the phone connected by USB and `adb` authorized:

```bash
# Easiest, no-root: a full bug report contains the snoop log.
adb bugreport r1-capture.zip
```

The snoop log is inside that zip at roughly
`FS/data/misc/bluetooth/logs/btsnoop_hci.log` (path varies by phone). Send me the
**whole `r1-capture.zip`** and I'll extract it — don't worry about finding the file
yourself.

If your phone happens to allow direct access (some do, many need root), this also
works and is smaller:

```bash
adb pull /data/misc/bluetooth/logs/btsnoop_hci.log r1-btsnoop.log   # may be permission-denied without root → use bugreport instead
```

> Privacy note: a full `bugreport.zip` contains a lot of unrelated device/system
> info. If you'd rather not share all of it, get me the `btsnoop_hci.log` alone via
> the bugreport (I'll tell you which single file to extract) — but the snoop log
> itself is the only thing I need.

## Step 4 — Hand it back

Give me, in the repo or attached:

1. `r1-capture.zip` (or the extracted `btsnoop_hci.log`).
2. Your **action timeline** — the list of actions with their HH:MM:SS times. Even a
   rough text list is enough:

   ```
   14:02:10  idle baseline start
   14:02:40  idle baseline end
   14:02:55  single tap x5
   14:03:20  double tap x5
   14:03:50  long press x5
   14:04:20  scroll forward x5
   ...
   14:06:00  health sync, on-screen HR = 72 bpm
   ```

3. The list of which gestures your ring actually has (so I'm not hunting for events
   that don't exist).

## Step 5 — Turn the snoop log back off

After capturing, set **Enable Bluetooth HCI snoop log** back to **Disabled** and
toggle Bluetooth off/on. Leaving it on logs everything continuously.

---

## What I'll do with it

In Wireshark I'll filter to the ring's connection handle and the `BAE8xxxx`
handles, line packets up against your timeline, and decode:

- **Gesture events** on `BAE80013` notifications (the priority — this is the
  make-or-break "ring controls glasses" path). I'll confirm whether they arrive on
  the **ring↔phone** link at all, which decides the whole architecture.
- **Health responses** to `getDailyData`-style writes on `BAE80012`, and whether
  derived metrics look gated behind GoMore keys vs. readable raw values.

If gestures decode over a path we can reach, the project is viable and we proceed
to the MentraOS fork. If they don't, that's the early "wash" signal — for the cost
of one capture session.

## If HCI snoop doesn't pan out (fallbacks)

- **Bonded/obfuscated payloads:** unlikely (HCI is below encryption), but if ATT
  payloads look like ciphertext above the link layer, next step is an **nRF52840
  Sniffer + Wireshark** capturing from before pairing, or static analysis of the
  decompiled Even app's `ring1/` protobuf definitions.
- **Gestures only on ring↔glasses:** if button events never appear on the phone
  link, we test whether the G2 forwards them to the host (MentraOS input events),
  and design around that relay.
