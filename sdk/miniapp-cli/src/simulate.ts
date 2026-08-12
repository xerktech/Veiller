/**
 * `veiller-miniapp simulate` — hand off to @veiller/miniapp-simulator.
 *
 * The simulator is a separate, monorepo-only package: it reaches into the app's
 * display pipeline and device profiles via relative paths into
 * `mobile/modules/engine`, which the published CLI must not depend on. So this
 * subcommand resolves it at runtime and explains itself when it isn't there,
 * rather than making it a hard dependency of every install.
 *
 * It resolves the simulator's **source** path by walking up from this file to
 * the monorepo root, not through node_modules. A package manager may
 * materialise a workspace/file: dependency as a copy, and a copy's
 * `../../../mobile/...` imports resolve to nothing — which made `simulate`
 * fail with "Cannot find module .../capabilities/even-realities-g2" even
 * inside the monorepo.
 */

import {existsSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const SIMULATOR_CLI_RELATIVE = join("sdk", "miniapp-simulator", "src", "cli.ts");

/** Walk up from this file looking for the monorepo's simulator source. */
function findSimulatorSource(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, SIMULATOR_CLI_RELATIVE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function simulate(argv: string[]): Promise<void> {
  let cliPath = findSimulatorSource();

  if (!cliPath) {
    try {
      cliPath = import.meta.resolve("@veiller/miniapp-simulator/cli");
    } catch {
      cliPath = null;
    }
  }

  if (!cliPath) {
    console.error(
      "`simulate` needs @veiller/miniapp-simulator, which ships with the Veiller\n" +
        "monorepo rather than this package. From a Veiller checkout:\n" +
        "\n" +
        "  bun run simulate <bundle>\n",
    );
    process.exit(1);
  }

  // The simulator CLI reads process.argv itself; hand it the tail so
  // `veiller-miniapp simulate ./dist --port 9000` behaves like the direct call.
  process.argv = [process.argv[0], cliPath, ...argv];
  await import(cliPath);
}
