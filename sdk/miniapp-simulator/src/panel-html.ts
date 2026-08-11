/**
 * The control-panel page. Kept as a single self-contained string so the
 * simulator has no build step and no static-asset copying: `bun run` the CLI
 * and the panel is there.
 */

export function panelHtml(): string {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Veiller miniapp simulator</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --line: #30363d; --text: #e6edf3;
    --muted: #8b949e; --accent: #4dff9e; --warn: #f0883e; --err: #ff7b72;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); overflow-x: hidden; }
  header {
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
    padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel);
  }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .meta { color: var(--muted); font-size: 13px; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; padding: 16px; align-items: start; }
  @media (max-width: 1100px) { main { grid-template-columns: minmax(0, 1fr); } }
  /* min-width:0 lets a grid child shrink below its content, so the wide
     monospace lens dump and the trace scroll inside their own boxes instead
     of stretching the page. */
  .stack, section { min-width: 0; }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  section h2 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 10px; }
  #lens { width: 100%; border-radius: 8px; overflow: hidden; background: #04140a; }
  #lens svg { display: block; width: 100%; height: auto; }
  pre { margin: 0; overflow-x: auto; font-size: 12px; line-height: 1.35;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  button {
    background: #21262d; color: var(--text); border: 1px solid var(--line);
    border-radius: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer;
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  iframe { width: 100%; height: 640px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
  #trace { height: 260px; overflow: auto; }
  .row { display: flex; gap: 8px; font-size: 12px; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
  .row .k { color: var(--muted); width: 62px; flex: none; }
  .row .t { min-width: 0; overflow-wrap: anywhere; }
  .row.error .t { color: var(--err); }
  .row.render .t { color: var(--accent); }
  .row.ui .t { color: var(--warn); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font-size: 11px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); }
  .stack { display: grid; gap: 16px; }
  .hint { color: var(--muted); font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<header>
  <h1 id="title">Veiller miniapp simulator</h1>
  <span class="meta" id="meta"></span>
</header>

<main>
  <div class="stack">
    <section>
      <h2>Glasses lens</h2>
      <div id="lens"></div>
      <div class="controls">
        <button data-gesture="single_tap">Tap</button>
        <button data-gesture="double_tap">Double tap</button>
        <button data-gesture="swipe_up">Swipe up</button>
        <button data-gesture="swipe_down">Swipe down</button>
        <button data-gesture="triple_tap">Triple tap</button>
        <button data-gesture="long_press">Long press</button>
        <button data-cmd="button" data-arg="short">Button press</button>
        <button data-cmd="button" data-arg="long">Button long-press</button>
        <button data-cmd="mic" data-arg="500">Mic burst</button>
        <button data-cmd="background">Background</button>
        <button data-cmd="foreground">Foreground</button>
      </div>
      <div class="hint" id="hint"></div>
    </section>

    <section>
      <h2>Lens, as text</h2>
      <pre id="text"></pre>
    </section>

    <section>
      <h2>Trace</h2>
      <div id="trace"></div>
    </section>
  </div>

  <div class="stack">
    <section>
      <h2>Phone page</h2>
      <div id="uiSlot"></div>
    </section>

    <section>
      <h2>Subscriptions</h2>
      <div class="chips" id="subs"></div>
    </section>

    <section>
      <h2>Storage</h2>
      <pre id="storage"></pre>
    </section>
  </div>
</main>

<script>
(function () {
  var ws = null;
  var traceEl = document.getElementById("trace");

  function connect() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/ws/panel");
    ws.onmessage = function (ev) {
      var msg = JSON.parse(ev.data);
      if (msg.type === "state") applyState(msg);
      else if (msg.type === "trace") appendTrace(msg.entry);
    };
    ws.onclose = function () { setTimeout(connect, 500); };
  }

  function send(cmd, arg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({cmd: cmd, arg: arg}));
  }

  var uiMounted = false;
  function applyState(s) {
    document.getElementById("lens").innerHTML = s.svg;
    document.getElementById("text").textContent = s.text;
    document.getElementById("title").textContent = s.name + " — Veiller miniapp simulator";
    document.getElementById("meta").textContent =
      s.packageName + " v" + s.version + " · " + s.model + " · " + s.width + "×" + s.height +
      " · phone " + s.visibility;
    const gaps = [];
    if (s.unimplemented && s.unimplemented.length)
      gaps.push("not implemented (answered NOT_IMPLEMENTED): " + s.unimplemented.join(", "));
    // Stubs answer ok without doing anything, so they are invisible to the
    // miniapp — call them out or a green run reads as a working feature.
    if (s.stubbed && s.stubbed.length)
      gaps.push("acknowledged but not simulated: " + s.stubbed.join(", "));
    document.getElementById("hint").textContent = gaps.length
      ? "Host calls with no real behaviour — " + gaps.join(" | ")
      : "";

    var subs = document.getElementById("subs");
    subs.innerHTML = "";
    (s.subscriptions.length ? s.subscriptions : ["(none)"]).forEach(function (name) {
      var el = document.createElement("span");
      el.className = "chip";
      el.textContent = name;
      subs.appendChild(el);
    });

    document.getElementById("storage").textContent =
      Object.keys(s.storage).length ? JSON.stringify(s.storage, null, 2) : "(empty)";

    if (!uiMounted) {
      uiMounted = true;
      var slot = document.getElementById("uiSlot");
      if (s.hasUi) {
        var frame = document.createElement("iframe");
        frame.src = "/app/";
        frame.title = "miniapp phone page";
        slot.appendChild(frame);
      } else {
        slot.innerHTML = '<p class="hint">This miniapp ships no phone page.</p>';
      }
    }
  }

  function appendTrace(entry) {
    var row = document.createElement("div");
    row.className = "row " + entry.kind;
    var stamp = new Date(entry.at).toISOString().slice(11, 19);
    row.innerHTML = '<span class="k">' + stamp + '</span><span class="t"></span>';
    row.querySelector(".t").textContent = "[" + entry.kind + "] " + entry.text;
    var atBottom = traceEl.scrollTop + traceEl.clientHeight >= traceEl.scrollHeight - 24;
    traceEl.appendChild(row);
    while (traceEl.childElementCount > 500) traceEl.removeChild(traceEl.firstChild);
    if (atBottom) traceEl.scrollTop = traceEl.scrollHeight;
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("button");
    if (!el) return;
    if (el.dataset.gesture) send("gesture", el.dataset.gesture);
    else if (el.dataset.cmd) send(el.dataset.cmd, el.dataset.arg);
  });

  connect();
})();
</script>
</body>
</html>`
}
