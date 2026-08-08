/**
 * `veiller-miniapp simulate` — hand off to @veiller/miniapp-simulator.
 *
 * The simulator is a separate, monorepo-only package: it reaches into the app's
 * display pipeline and device profiles, which the published CLI must not
 * depend on. So this subcommand resolves it at runtime and explains itself when
 * it isn't there, rather than making it a hard dependency of every install.
 */

export async function simulate(argv: string[]): Promise<void> {
  let cliPath: string
  try {
    cliPath = import.meta.resolve("@veiller/miniapp-simulator/cli")
  } catch {
    console.error(
      "`simulate` needs @veiller/miniapp-simulator, which ships with the Veiller\n" +
        "monorepo rather than this package. From a Veiller checkout:\n" +
        "\n" +
        "  bun run simulate <bundle>\n",
    )
    process.exit(1)
  }

  // The simulator CLI reads process.argv itself; hand it the tail so
  // `veiller-miniapp simulate ./dist --port 9000` behaves like the direct call.
  process.argv = [process.argv[0], cliPath, ...argv]
  await import(cliPath)
}
