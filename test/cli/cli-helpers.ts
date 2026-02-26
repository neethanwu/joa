import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_ENTRY = resolve(import.meta.dir, "../../src/cli/main.ts");

/**
 * Spawn `bun src/cli/main.ts` with an isolated HOME directory.
 * Since joa uses `os.homedir()` to resolve `~/.joa/`, overriding HOME
 * gives us full filesystem isolation without needing a JOA_HOME env var.
 */
export async function runJoa(
  args: string[],
  opts?: { env?: Record<string, string>; home?: string },
): Promise<CliResult> {
  const home = opts?.home ?? makeJoaHome();
  const proc = Bun.spawn(["bun", CLI_ENTRY, ...args], {
    env: { ...process.env, HOME: home, ...opts?.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

/**
 * Create an isolated HOME with the `.joa/journals/` structure pre-created.
 */
export function makeJoaHome(): string {
  const home = mkdtempSync(join(tmpdir(), "joa-home-test-"));
  mkdirSync(join(home, ".joa", "journals"), { recursive: true });
  return home;
}

export function cleanupJoaHome(home: string): void {
  rmSync(home, { recursive: true });
}
