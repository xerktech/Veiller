#!/usr/bin/env bun
/**
 * veiller-simulate — run a miniapp on simulated glasses.
 *
 *   veiller-simulate ./my-miniapp                 open the control panel
 *   veiller-simulate ./bundle.zip --headless      boot, print the lens, exit
 *   veiller-simulate ./my-miniapp --scenario x.ts run a script against it
 */

import {resolve} from "node:path"

import {startPanel} from "./panel"
import {Simulator, delay} from "./simulator"
import {MODELS} from "./models"

interface Args {
  bundle: string | null
  model: string | undefined
  port: number
  headless: boolean
  scenario: string | null
  verbose: boolean
  storage: Record<string, string>
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bundle: null,
    model: undefined,
    port: 8770,
    headless: false,
    scenario: null,
    verbose: false,
    storage: {},
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case "-h":
      case "--help":
        args.help = true
        break
      case "--model": {
        const value = argv[++i]
        if (!value || value.startsWith("-")) throw new Error("--model requires a value (g1 or g2)")
        args.model = value
        break
      }
      case "--port": {
        const raw = argv[++i]
        const value = Number(raw)
        // Number("abc") is NaN, which Bun.serve treats as "pick any free
        // port" — the simulator then printed the port the user asked for
        // while listening somewhere else entirely.
        if (!raw || !Number.isInteger(value) || value < 1 || value > 65535) {
          throw new Error(`--port requires an integer between 1 and 65535 (got ${raw ?? "nothing"})`)
        }
        args.port = value
        break
      }
      case "--headless":
        args.headless = true
        break
      case "--verbose":
        args.verbose = true
        break
      case "--scenario": {
        const value = argv[++i]
        if (!value || value.startsWith("-")) throw new Error("--scenario requires a file path")
        args.scenario = value
        break
      }
      case "--storage": {
        // --storage key=value, repeatable. Seeds session.storage so a run can
        // start already signed in / already configured.
        const pair = argv[++i] ?? ""
        const eq = pair.indexOf("=")
        if (eq <= 0) throw new Error(`--storage expects key=value (got ${pair || "nothing"})`)
        args.storage[pair.slice(0, eq)] = pair.slice(eq + 1)
        break
      }
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}`)
        args.bundle = arg
    }
  }
  return args
}

function usage(): string {
  return `veiller-simulate — run a Veiller miniapp on simulated glasses

Usage:
  veiller-simulate <bundle> [options]

<bundle> is a packed .zip, or a directory holding miniapp.json (a source
directory works too — its dist/ or build/ output is found automatically).

Options:
  --model <name>      Glasses to emulate: ${Object.keys(MODELS).join(", ")} (default g2)
  --port <n>          Control-panel port (default 8770)
  --headless          Boot, print the lens, exit. No panel.
  --scenario <file>   Run a script instead of the panel. It is imported and its
                      default export called with the Simulator.
  --storage k=v       Seed session.storage. Repeatable.
  --verbose           Mirror the miniapp's console and host traffic to stdout.
  -h, --help          This message.
`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.bundle) {
    process.stdout.write(usage())
    process.exit(args.help ? 0 : 1)
  }

  const sim = new Simulator({
    bundle: args.bundle,
    ...(args.model ? {model: args.model} : {}),
    ...(Object.keys(args.storage).length ? {storage: args.storage} : {}),
    verbose: args.verbose,
  })
  await sim.start()

  const {name, version, packageName} = sim.bundle.manifest
  process.stdout.write(`${name} ${version} (${packageName}) on ${sim.glasses.model.name}\n`)

  if (args.scenario) {
    const mod = (await import(resolve(args.scenario))) as {default?: (s: Simulator) => Promise<void>}
    if (typeof mod.default !== "function") {
      throw new Error(`${args.scenario} must default-export a function taking the Simulator`)
    }
    await mod.default(sim)
    await sim.stop()
    process.exit(0)
  }

  if (args.headless) {
    // Give the miniapp a moment past CONNECT_ACK to paint its first real frame.
    await sim.settle(200, 4000)
    process.stdout.write(`${sim.lens()}\n`)
    await sim.stop()
    process.exit(0)
  }

  const panel = startPanel(sim, args.port)
  process.stdout.write(`\nControl panel: ${panel.url}\n\nPress Ctrl-C to stop.\n`)

  const shutdown = async () => {
    panel.stop()
    await sim.stop()
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())

  // Keep the process alive; the panel and the miniapp's own timers do the work.
  for (;;) await delay(60_000)
}

// A bad flag, an unknown model or a bundle path that does not exist are user
// errors, not simulator crashes — report them as one line rather than a stack
// trace into someone else's source.
try {
  await main()
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`veiller-simulate: ${message}\n`)
  process.exit(1)
}
