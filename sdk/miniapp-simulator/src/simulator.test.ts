/**
 * End-to-end: a real bundle on disk, evaluated in the emulated JSContext,
 * talking the real wire protocol to the host.
 *
 * The fixture speaks the protocol directly rather than importing the SDK, so
 * the test covers the simulator's own plumbing — bundle loading, the JSContext
 * bridge, the handshake, subscription gating, the display pipeline, storage and
 * the UI bus — without pinning it to a particular SDK build.
 */

import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, mkdir, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"

import {Simulator} from "./simulator"

/**
 * A miniapp that: connects, subscribes to touch and audio, paints a status
 * line, echoes taps onto the lens, records mic frames in storage, and answers
 * one UI channel. Written against the legacy `__mentra*` globals on purpose —
 * that is the ABI every published bundle still uses.
 */
const FIXTURE_BACKGROUND = `
(function () {
  var pending = {};
  var nextId = 1;
  var taps = 0;
  var micFrames = 0;

  function send(payload, requestId) {
    var envelope = {payload: payload};
    if (requestId) envelope.requestId = requestId;
    __dispatch("__bridge", "send", JSON.stringify([JSON.stringify(envelope)]));
  }

  function request(payload) {
    var id = "r" + nextId++;
    return new Promise(function (resolve) {
      pending[id] = resolve;
      send(payload, id);
    });
  }

  function render(elements) {
    return request({type: "miniapp_render", view: "main", elements: elements});
  }

  function paint() {
    render([
      {type: "text", id: "status", box: {x: 0, y: 0, w: 576, h: 40}, text: "taps: " + taps},
      {type: "text", id: "mic", box: {x: 0, y: 40, w: 576, h: 40}, text: "frames: " + micFrames},
    ]);
  }

  globalThis.__mentraInitCallback = function () {
    globalThis.__mentraDeliverBridgeRaw = function (raw) {
      var envelope = JSON.parse(raw);
      var payload = envelope.payload;
      if (payload.type === "miniapp_connect_ack") {
        console.log("fixture connected as " + payload.userId);
        send({type: "miniapp_subscribe", subscriptions: ["touch_event", "audio_chunk"]});
        paint();
        return;
      }
      if (payload.type === "miniapp_request_result" && envelope.requestId) {
        var resolve = pending[envelope.requestId];
        delete pending[envelope.requestId];
        if (resolve) resolve(payload.data);
        return;
      }
      if (payload.type === "miniapp_event") {
        if (payload.streamType === "touch_event") {
          taps += 1;
          request({type: "miniapp_storage_set", key: "taps", value: String(taps)});
          paint();
          return;
        }
        if (payload.streamType === "audio_chunk") {
          micFrames += 1;
          paint();
          return;
        }
        if (payload.streamType === "_ui") {
          var ui = payload.data;
          if (ui.type === "UI_OPEN") {
            send({type: "UI_SEND", channel: "hello", payload: {from: "background"}, seq: 1});
            return;
          }
          if (ui.type === "UI_MESSAGE" && ui.requestId) {
            send({
              type: "UI_SEND",
              channel: ui.channel,
              payload: {ok: true, result: {echoed: ui.payload}},
              seq: 2,
              requestId: ui.requestId,
            });
          }
          return;
        }
      }
    };
    send({type: "miniapp_connect", packageName: "com.veiller.fixture"}, "connect-1");
  };
})();
`

async function writeFixture(opts: {ui?: boolean} = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "veiller-sim-fixture-"))
  await mkdir(join(root, "background"), {recursive: true})
  await writeFile(join(root, "background", "index.js"), FIXTURE_BACKGROUND)
  const manifest: Record<string, unknown> = {
    packageName: "com.veiller.fixture",
    version: "1.0.0",
    name: "Fixture",
    type: "standard",
    entry: {background: "background/index.js", ...(opts.ui ? {ui: "ui/index.html"} : {})},
    permissions: [{type: "MICROPHONE", description: "test"}],
  }
  if (opts.ui) {
    await mkdir(join(root, "ui"), {recursive: true})
    await writeFile(join(root, "ui", "index.html"), "<!doctype html><html><head></head><body>hi</body></html>")
  }
  await writeFile(join(root, "miniapp.json"), JSON.stringify(manifest, null, 2))
  return root
}

let running: Simulator | null = null
afterEach(async () => {
  await running?.stop()
  running = null
})

async function boot(opts: {ui?: boolean; storage?: Record<string, string>} = {}): Promise<Simulator> {
  const sim = new Simulator({
    bundle: await writeFixture({...(opts.ui ? {ui: true} : {})}),
    ...(opts.storage ? {storage: opts.storage} : {}),
  })
  running = sim
  await sim.start()
  return sim
}

describe("Simulator", () => {
  test("boots a bundle, completes the handshake, and paints the lens", async () => {
    const sim = await boot()
    await sim.settle()

    expect(sim.host.connected).toBe(true)
    expect(sim.bundle.manifest.packageName).toBe("com.veiller.fixture")
    expect(sim.lensText()).toEqual(["taps: 0", "frames: 0"])
    expect(sim.lens()).toContain("taps: 0")
  })

  test("forwards the miniapp's console to the trace", async () => {
    const sim = await boot()
    await sim.settle()
    expect(sim.host.trace.some((e) => e.kind === "log" && e.text.includes("fixture connected"))).toBe(true)
  })

  test("delivers touch only to a subscribed miniapp, and the lens follows", async () => {
    const sim = await boot()
    await sim.settle()

    expect(sim.tap()).toBe(true)
    await sim.waitForLens("taps: 1")

    expect(sim.doubleTap()).toBe(true)
    await sim.waitForLens("taps: 2")

    // Nothing subscribed to this stream, so nothing is delivered.
    expect(sim.emit("glasses_battery", {level: 50})).toBe(false)
  })

  test("mic frames reach the miniapp", async () => {
    const sim = await boot()
    await sim.settle()
    expect(sim.speak({ms: 20})).toBe(true)
    expect(sim.speak({ms: 20})).toBe(true)
    await sim.waitForLens("frames: 2")
  })

  test("storage round-trips and can be seeded before boot", async () => {
    const sim = await boot({storage: {seeded: "yes"}})
    await sim.settle()
    expect(sim.host.storageSnapshot().seeded).toBe("yes")

    sim.tap()
    await sim.waitForLens("taps: 1")
    expect(sim.host.storageSnapshot().taps).toBe("1")
  })

  test("the phone page bus carries broadcasts and RPC in both directions", async () => {
    const sim = await boot({ui: true})
    await sim.settle()

    const hello = sim.phone.waitFor<{from: string}>("hello")
    sim.phone.open()
    expect((await hello).from).toBe("background")

    const reply = await sim.phone.request<{echoed: {n: number}}>("echo", {n: 7})
    expect(reply.echoed).toEqual({n: 7})
  })

  test("background sends are dropped while no page is mounted", async () => {
    const sim = await boot({ui: true})
    await sim.settle()
    // Never opened: the background's ui.send has nowhere to go, which is the
    // documented drop-don't-buffer policy on that side of the bus.
    expect(sim.host.isUiOpen()).toBe(false)
    expect(sim.phone.last("hello")).toBeUndefined()
  })

  test("a request the simulator does not implement is reported, not faked", async () => {
    const sim = await boot()
    await sim.settle()
    sim.host.handleRaw(JSON.stringify({payload: {type: "miniapp_photo"}, requestId: "x"}))
    expect(sim.host.unimplemented).toContain("miniapp_photo")
  })

  test("visibility changes are pushed to the miniapp", async () => {
    const sim = await boot()
    await sim.settle()
    sim.background()
    expect(sim.host.visibility).toBe("background")
    sim.foreground()
    expect(sim.host.visibility).toBe("foreground")
  })
})

describe("bundle loading", () => {
  test("rejects a directory that is not a bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "veiller-not-a-bundle-"))
    await expect(new Simulator({bundle: dir}).start()).rejects.toThrow(/not a miniapp bundle/)
  })

  test("rejects a manifest whose background entry is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "veiller-sim-nobg-"))
    await writeFile(
      join(root, "miniapp.json"),
      JSON.stringify({packageName: "x", version: "1.0.0", name: "x", entry: {background: "background/index.js"}}),
    )
    await expect(new Simulator({bundle: root}).start()).rejects.toThrow(/background entry/)
  })
})
