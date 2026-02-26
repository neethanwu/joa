import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import yaml from "js-yaml";
import {
  ConfigError,
  DatabaseError,
  JournalWriteError,
  ValidationError,
  bootstrap,
  importEntries,
  loadConfig,
  log,
  query,
  rebuildIndex,
  resolveJournalsPath,
  serializeEntry,
  status,
} from "../core/index.ts";
import type { PresetName } from "../core/index.ts";
import { bold, colorizeCompactLine, cyan, dim, green, red, yellow } from "./output.ts";

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    // Global
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
    // Log / Query shared
    category: { type: "string", short: "c" },
    tag: { type: "string", short: "t", multiple: true },
    format: { type: "string", short: "f" },
    // Log specific
    thread: { type: "string" },
    detail: { type: "string", short: "d" },
    resource: { type: "string", short: "r", multiple: true },
    // Query specific
    preset: { type: "string", short: "p" },
    search: { type: "string", short: "s" },
    since: { type: "string" },
    until: { type: "string" },
    limit: { type: "string", short: "n" },
    session: { type: "string" },
    agent: { type: "string" },
    device: { type: "string" },
  },
  allowPositionals: true,
});

const command = positionals[0] ?? "";
const args = positionals.slice(1);

// ---------------------------------------------------------------------------
// Version / Help
// ---------------------------------------------------------------------------

function showVersion(): void {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    console.log(`joa ${pkg.version}`);
  } catch {
    console.log("joa (unknown version)");
  }
}

function showHelp(cmd?: string): void {
  switch (cmd) {
    case "log":
      console.log(`Usage: joa log <summary> [options]

Log a journal entry.

Options:
  -c, --category <cat>    Entry category (default: "observation")
  -t, --tag <tag>         Tags (repeat for multiple)
      --thread <id|new>   Thread ID or "new" to start a thread
  -d, --detail <json>     JSON detail object
  -r, --resource <path>   Resource paths/URLs (repeat for multiple)`);
      return;

    case "query":
      console.log(`Usage: joa query [options]

Query journal entries.

Options:
  -p, --preset <name>     Preset: catchup, threads, timeline, decisions, changes
  -s, --search <term>     Full-text search
  -c, --category <cat>    Category filter
  -t, --tag <tag>         Tag filter (repeat for multiple)
      --thread <id>       Thread ID filter
      --session <id>      Session ID filter
      --agent <name>      Agent filter
      --device <name>     Device filter
      --since <time>      Time filter (1d, 7d, 2w, 1m, or ISO date)
      --until <time>      Time upper bound
  -n, --limit <num>       Max entries (default: 50)
  -f, --format <fmt>      Output format: compact, md, json (default: compact)`);
      return;

    case "export":
      console.log(`Usage: joa export [options] > backup.jsonl

Export entries as JSONL to stdout.

Options:
  --since <time>          Time filter
  --until <time>          Time upper bound
  -c, --category <cat>    Category filter
  -t, --tag <tag>         Tag filter`);
      return;

    case "import":
      console.log(`Usage: joa import <file.jsonl>
       cat entries.jsonl | joa import -

Import entries from a JSONL file or stdin.`);
      return;

    case "config":
      console.log(`Usage: joa config get <key>
       joa config set <key> <value>

Supported keys: device, agent, defaults.device, defaults.agent,
  defaults.tags, db.path, journals.path`);
      return;

    case "setup":
      console.log(`Usage: joa setup

Interactive setup to configure joa for your agent platforms.

Universal (always included):
  Claude Code, Cursor, Gemini CLI, Codex, Amp, OpenCode

Additional (selectable):
  GitHub Copilot, Pi`);
      return;

    default:
      console.log(`${bold("joa")} — Journal of Agents

${bold("Usage:")} joa <command> [options]

${bold("Commands:")}
  log <summary>     Log a journal entry
  query             Query entries with filters
  catchup           Recent entries (last 7 days)
  threads           Active threads summary
  timeline          Chronological entries
  decisions         Decision entries
  search <term>     Full-text search
  status            Journal health and stats
  rebuild           Rebuild SQLite index from JSONL
  export            Export entries as JSONL
  import <file>     Import entries from JSONL
  setup             Configure joa for agent platforms
  config get|set    View or update configuration
  mcp [--agent <n>] Start MCP stdio server

${bold("Flags:")}
  -h, --help        Show help (or command-specific help)
  -v, --version     Show version

Run ${cyan("joa <command> --help")} for command-specific usage.`);
  }
}

if (values.version) {
  showVersion();
  process.exit(0);
}

if (!command || values.help) {
  showHelp(command || undefined);
  process.exit(values.help ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function cmdLog(cmdArgs: string[], vals: typeof values): Promise<void> {
  const summary = cmdArgs[0];
  if (!summary) {
    console.error(red("Usage: joa log <summary> [options]"));
    process.exit(1);
  }

  let detail: Record<string, unknown> | undefined;
  if (vals.detail) {
    try {
      detail = JSON.parse(vals.detail);
    } catch {
      console.error(red("Invalid JSON in --detail"));
      process.exit(1);
    }
  }

  const { logCtx } = await bootstrap();
  const result = await log(
    {
      summary,
      category: vals.category ?? "observation",
      thread_id: vals.thread,
      tags: vals.tag,
      detail,
      resources: vals.resource,
    },
    logCtx,
  );

  console.log(
    green("Logged: ") +
      result.entry_id +
      (result.thread_id ? dim(` (thread: ${result.thread_id})`) : ""),
  );
  if (result.warning) {
    console.error(yellow(`Warning: ${result.warning}`));
  }
}

async function cmdQuery(vals: typeof values): Promise<void> {
  // Validate preset
  const validPresets = ["catchup", "threads", "timeline", "decisions", "changes"];
  if (vals.preset && !validPresets.includes(vals.preset)) {
    console.error(red(`Invalid preset: ${vals.preset}. Valid presets: ${validPresets.join(", ")}`));
    process.exit(1);
  }

  // Validate limit
  let limit: number | undefined;
  if (vals.limit) {
    limit = Number.parseInt(vals.limit, 10);
    if (Number.isNaN(limit) || limit <= 0) {
      console.error(red("--limit must be a positive integer"));
      process.exit(1);
    }
  }

  // Normalize empty search
  const search = vals.search?.trim() || undefined;

  const { config, readCtx } = await bootstrap();
  const result = query(
    {
      preset: vals.preset as PresetName | undefined,
      search,
      category: vals.category,
      tags: vals.tag,
      thread_id: vals.thread,
      session_id: vals.session,
      agent: vals.agent,
      device: vals.device,
      since: vals.since,
      until: vals.until,
      limit,
      format: (vals.format as "md" | "json" | "compact") ?? "compact",
    },
    readCtx,
    config,
  );

  // Colorize compact output for terminal
  if (result.format === "compact" && result.rendered !== "No entries found.") {
    const lines = result.rendered.split("\n").map(colorizeCompactLine);
    console.log(lines.join("\n"));
  } else {
    console.log(result.rendered);
  }

  if (result.entries.length > 0 && result.total > result.entries.length) {
    console.error(dim(`Showing ${result.entries.length} of ${result.total} entries`));
  }
}

async function cmdStatus(): Promise<void> {
  const { config, readCtx, sid } = await bootstrap();
  const s = status(readCtx, config, sid);

  const categories = Object.entries(s.entries_by_category)
    .map(([cat, count]) => `${cat} (${count})`)
    .join(", ");

  const dbSize =
    s.db_size_bytes > 0 ? `${(s.db_size_bytes / 1024 / 1024).toFixed(1)} MB` : "in-memory";

  console.log(`${bold("joa status")}
  ${dim("Entries:")}     ${s.total_entries.toLocaleString()}
  ${dim("Categories:")}  ${categories || "none"}
  ${dim("Oldest:")}      ${s.oldest_entry ?? "\u2014"}
  ${dim("Newest:")}      ${s.newest_entry ?? "\u2014"}
  ${dim("Session:")}     ${s.current_session_id}
  ${dim("DB:")}          ${s.db_path} (${dbSize}, ${s.db_healthy ? green("healthy") : red("unhealthy")})
  ${dim("Journals:")}    ${s.journals_dir} (${s.journal_files} files)`);
}

async function cmdRebuild(): Promise<void> {
  const { config, db } = await bootstrap();
  const journalsDir = resolveJournalsPath(config);
  console.log("Rebuilding index from JSONL files...");
  await rebuildIndex(db, journalsDir);
  const count = db.countEntries({});
  console.log(green(`Done. Indexed ${count} entries.`));
}

async function cmdExport(vals: typeof values): Promise<void> {
  const { config, readCtx } = await bootstrap();
  const result = query(
    {
      category: vals.category,
      tags: vals.tag,
      since: vals.since,
      until: vals.until,
      limit: vals.limit ? Number.parseInt(vals.limit, 10) : 10000,
      format: "json",
    },
    readCtx,
    config,
  );

  for (const entry of result.entries) {
    const row = serializeEntry(entry);
    process.stdout.write(`${JSON.stringify(row)}\n`);
  }
  console.error(dim(`Exported ${result.entries.length} entries`));
}

async function cmdImport(cmdArgs: string[]): Promise<void> {
  const file = cmdArgs[0];
  if (!file) {
    console.error(red("Usage: joa import <file.jsonl> or joa import -"));
    process.exit(1);
  }

  const MAX_STDIN_BYTES = 100 * 1024 * 1024; // 100 MB

  let content: string;
  if (file === "-") {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of process.stdin) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_STDIN_BYTES) {
        console.error(red(`Stdin exceeds ${MAX_STDIN_BYTES / 1024 / 1024} MB limit`));
        process.exit(1);
      }
      chunks.push(chunk);
    }
    content = Buffer.concat(chunks).toString("utf8");
  } else {
    try {
      content = readFileSync(file, "utf8");
    } catch {
      console.error(red(`Cannot read file: ${file}`));
      process.exit(1);
    }
  }

  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    console.log("No entries to import");
    return;
  }

  const { logCtx } = await bootstrap();
  const result = await importEntries(lines, logCtx.db, logCtx.journalsDir);

  console.log(
    green(`Imported ${result.imported} entries`) +
      (result.skipped > 0 ? dim(` (${result.skipped} skipped as duplicates)`) : "") +
      (result.malformed > 0 ? yellow(` (${result.malformed} malformed)`) : ""),
  );
}

// ---------------------------------------------------------------------------
// Agent registry — config paths and write strategies per platform
// ---------------------------------------------------------------------------

interface AgentDef {
  label: string;
  tier: "universal" | "additional";
  globalPath: (home: string) => string;
  localPath: (cwd: string) => string;
  writeConfig: (configPath: string, agentName: string) => void;
}

function writeJsonMcpServers(
  configPath: string,
  serverEntry: Record<string, unknown>,
  rootKey = "mcpServers",
): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      console.warn(yellow(`Warning: ${configPath} contains invalid JSON and will be overwritten`));
    }
  }

  const merged = {
    ...existing,
    [rootKey]: {
      ...(existing[rootKey] as Record<string, unknown> | undefined),
      ...serverEntry,
    },
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

function standardWriter(configPath: string, agentName: string): void {
  writeJsonMcpServers(configPath, {
    joa: { command: "joa", args: ["mcp", "--agent", agentName] },
  });
}

const AGENTS: Record<string, AgentDef> = {
  // --- Universal ---
  "claude-code": {
    label: "Claude Code",
    tier: "universal",
    globalPath: (home) => join(home, ".claude.json"),
    localPath: (cwd) => join(cwd, ".mcp.json"),
    writeConfig: standardWriter,
  },
  cursor: {
    label: "Cursor",
    tier: "universal",
    globalPath: (home) => join(home, ".cursor", "mcp.json"),
    localPath: (cwd) => join(cwd, ".cursor", "mcp.json"),
    writeConfig: standardWriter,
  },
  "gemini-cli": {
    label: "Gemini CLI",
    tier: "universal",
    globalPath: (home) => join(home, ".gemini", "settings.json"),
    localPath: (cwd) => join(cwd, ".gemini", "settings.json"),
    writeConfig: standardWriter,
  },
  codex: {
    label: "Codex",
    tier: "universal",
    globalPath: (home) => join(home, ".codex", "config.toml"),
    localPath: (cwd) => join(cwd, ".codex", "config.toml"),
    writeConfig: (configPath, agentName) => {
      const dir = dirname(configPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      // Codex uses TOML. Read existing, append/replace the [mcp_servers.joa] section.
      let existing = "";
      if (existsSync(configPath)) {
        try {
          existing = readFileSync(configPath, "utf8");
        } catch {
          console.warn(yellow(`Warning: ${configPath} is unreadable and will be overwritten`));
        }
      }

      // Remove existing [mcp_servers.joa] block if present
      const cleaned = existing.replace(/\[mcp_servers\.joa\][^\[]*(?=\[|$)/s, "").trimEnd();

      const block = `\n\n[mcp_servers.joa]\ncommand = "joa"\nargs = ["mcp", "--agent", "${agentName}"]\n`;
      writeFileSync(configPath, cleaned + block);
    },
  },
  amp: {
    label: "Amp",
    tier: "universal",
    globalPath: (home) => join(home, ".config", "amp", "settings.json"),
    localPath: (cwd) => join(cwd, ".amp", "settings.json"),
    writeConfig: (configPath, agentName) => {
      writeJsonMcpServers(
        configPath,
        { joa: { command: "joa", args: ["mcp", "--agent", agentName] } },
        "amp.mcpServers",
      );
    },
  },
  opencode: {
    label: "OpenCode",
    tier: "universal",
    globalPath: (home) => join(home, ".config", "opencode", "opencode.json"),
    localPath: (cwd) => join(cwd, "opencode.json"),
    writeConfig: (configPath, agentName) => {
      const dir = dirname(configPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      let existing: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        try {
          existing = JSON.parse(readFileSync(configPath, "utf8"));
        } catch {
          console.warn(
            yellow(`Warning: ${configPath} contains invalid JSON and will be overwritten`),
          );
        }
      }

      const mcp = (existing.mcp as Record<string, unknown> | undefined) ?? {};
      const merged = {
        ...existing,
        mcp: {
          ...mcp,
          joa: {
            type: "local",
            command: ["joa", "mcp", "--agent", agentName],
          },
        },
      };
      writeFileSync(configPath, JSON.stringify(merged, null, 2));
    },
  },

  // --- Additional ---
  "github-copilot": {
    label: "GitHub Copilot",
    tier: "additional",
    globalPath: (_home) => {
      if (process.platform === "darwin")
        return join(homedir(), "Library", "Application Support", "Code", "User", "mcp.json");
      if (process.platform === "win32")
        return join(process.env.APPDATA ?? homedir(), "Code", "User", "mcp.json");
      return join(homedir(), ".config", "Code", "User", "mcp.json");
    },
    localPath: (cwd) => join(cwd, ".vscode", "mcp.json"),
    writeConfig: (configPath, agentName) => {
      writeJsonMcpServers(
        configPath,
        {
          joa: {
            type: "stdio",
            command: "joa",
            args: ["mcp", "--agent", agentName],
          },
        },
        "servers",
      );
    },
  },
  pi: {
    label: "Pi",
    tier: "additional",
    globalPath: (home) => join(home, ".pi", "mcp.json"),
    localPath: (cwd) => join(cwd, ".pi", "mcp.json"),
    writeConfig: standardWriter,
  },
};

const UNIVERSAL_AGENTS = Object.entries(AGENTS)
  .filter(([, def]) => def.tier === "universal")
  .map(([id]) => id);

const ADDITIONAL_AGENTS = Object.entries(AGENTS)
  .filter(([, def]) => def.tier === "additional")
  .map(([id, def]) => ({ value: id, label: def.label }));

// ---------------------------------------------------------------------------
// joa setup
// ---------------------------------------------------------------------------

async function cmdSetup(): Promise<void> {
  const { intro, outro, note, multiselect, select, confirm, isCancel, cancel } = await import(
    "@clack/prompts"
  );

  intro(bold("joa setup"));

  const universalLabels = UNIVERSAL_AGENTS.map((id) => `  \u2022 ${AGENTS[id]?.label}`).join("\n");
  note(universalLabels, "Universal agents (always included)");

  const additional = await multiselect({
    message: "Select additional agents (Enter to skip)",
    options: ADDITIONAL_AGENTS,
    required: false,
  });

  if (isCancel(additional)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }

  const allAgents = [...UNIVERSAL_AGENTS, ...(additional as string[])];

  const scope = await select({
    message: "Installation scope?",
    options: [
      {
        value: "global" as const,
        label: "Global",
        hint: "user-level config files",
      },
      { value: "local" as const, label: "Local", hint: "project-level config files" },
    ],
  });

  if (isCancel(scope)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }

  const agentList = allAgents.map((id) => AGENTS[id]?.label ?? id).join(", ");
  const proceed = await confirm({
    message: `Configure joa for ${agentList} (${scope})?`,
  });

  if (isCancel(proceed) || !proceed) {
    cancel("Setup cancelled.");
    process.exit(0);
  }

  // Ensure ~/.joa directory structure
  const joaDir = join(homedir(), ".joa");
  const journalsDir = join(joaDir, "journals");
  if (!existsSync(joaDir)) mkdirSync(joaDir, { recursive: true });
  if (!existsSync(journalsDir)) mkdirSync(journalsDir, { recursive: true });

  const home = homedir();
  const cwd = process.cwd();
  for (const agentId of allAgents) {
    const def = AGENTS[agentId];
    if (!def) continue;
    const configPath = scope === "local" ? def.localPath(cwd) : def.globalPath(home);
    def.writeConfig(configPath, agentId);
    console.log(green(`  \u2713 ${def.label}`) + dim(` \u2192 ${configPath}`));
  }

  outro(green("Done! joa is ready."));
}

function cmdConfigGet(key: string | undefined): void {
  if (!key) {
    console.error(red("Usage: joa config get <key>"));
    process.exit(1);
  }

  const config = loadConfig();

  // Resolve aliases
  const resolvedKey =
    key === "device" ? "defaults.device" : key === "agent" ? "defaults.agent" : key;

  const parts = resolvedKey.split(".");
  let value: unknown = config;
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== "object") {
      console.error(red(`Unknown config key: ${key}`));
      process.exit(1);
    }
    value = (value as Record<string, unknown>)[part];
  }

  if (value === undefined) {
    console.error(red(`Unknown config key: ${key}`));
    process.exit(1);
  }

  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function cmdConfigSet(key: string | undefined, val: string | undefined): Promise<void> {
  if (!key || val === undefined) {
    console.error(red("Usage: joa config set <key> <value>"));
    process.exit(1);
  }

  const joaDir = join(homedir(), ".joa");
  const configPath = join(joaDir, "config.yaml");

  if (!existsSync(joaDir)) mkdirSync(joaDir, { recursive: true });

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = yaml.load(readFileSync(configPath, "utf8"));
      if (raw && typeof raw === "object") config = raw as Record<string, unknown>;
    } catch {
      // Malformed config — start fresh
    }
  }

  // Resolve aliases
  const resolvedKey =
    key === "device" ? "defaults.device" : key === "agent" ? "defaults.agent" : key;

  const validTopKeys = ["defaults", "db", "journals", "presets"];
  const topKey = resolvedKey.split(".")[0];
  if (topKey && !validTopKeys.includes(topKey)) {
    console.error(red(`Unknown config key: ${key}. Valid keys: ${validTopKeys.join(", ")}`));
    process.exit(1);
  }

  // Parse value — detect JSON
  let parsed: unknown = val;
  if (
    val.startsWith("[") ||
    val.startsWith("{") ||
    val === "true" ||
    val === "false" ||
    val === "null"
  ) {
    try {
      parsed = JSON.parse(val);
    } catch {
      // Keep as string
    }
  }

  // Set nested key
  const parts = resolvedKey.split(".");
  let obj: Record<string, unknown> = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === undefined) break;
    if (typeof obj[part] !== "object" || obj[part] === null) {
      obj[part] = {};
    }
    obj = obj[part] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  if (lastKey !== undefined) obj[lastKey] = parsed;

  writeFileSync(configPath, yaml.dump(config));
  console.log(
    green(`Set ${key} = ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`),
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const v = values;

try {
  switch (command) {
    case "log":
      await cmdLog(args, v);
      break;
    case "query":
      await cmdQuery(v);
      break;
    case "catchup":
      await cmdQuery({ ...v, preset: "catchup" });
      break;
    case "threads":
      await cmdQuery({ ...v, preset: "threads" });
      break;
    case "timeline":
      await cmdQuery({ ...v, preset: "timeline" });
      break;
    case "decisions":
      await cmdQuery({ ...v, preset: "decisions" });
      break;
    case "search":
      await cmdQuery({ ...v, search: args.join(" ") });
      break;
    case "status":
      await cmdStatus();
      break;
    case "rebuild":
      await cmdRebuild();
      break;
    case "export":
      await cmdExport(v);
      break;
    case "import":
      await cmdImport(args);
      break;
    case "setup":
      await cmdSetup();
      break;
    case "config": {
      switch (args[0]) {
        case "get":
          cmdConfigGet(args[1]);
          break;
        case "set":
          await cmdConfigSet(args[1], args[2]);
          break;
        default:
          showHelp("config");
          process.exit(1);
      }
      break;
    }
    case "mcp":
      if (values.agent) process.env.JOA_MCP_AGENT = values.agent;
      await import("../mcp/server.ts");
      break;
    default:
      console.error(red(`Unknown command: ${command}`));
      showHelp();
      process.exit(1);
  }
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(red(err.message));
    process.exit(1);
  }
  if (err instanceof DatabaseError) {
    console.error(red(`Database error: ${err.message}`));
    console.error(dim("Try running: joa rebuild"));
    process.exit(2);
  }
  if (err instanceof JournalWriteError) {
    console.error(red(`Write error: ${err.message}`));
    console.error(dim("Check disk space and file permissions for your journals directory."));
    process.exit(3);
  }
  if (err instanceof ConfigError) {
    console.error(red(`Config error: ${err.message}`));
    console.error(dim("Check your config file: ~/.joa/config.yaml or .joa.yaml"));
    process.exit(4);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(red(`Error: ${message}`));
  process.exit(1);
}
