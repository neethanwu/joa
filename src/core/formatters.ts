import type { Entry } from "./entry.ts";

/**
 * Formats entries as Markdown for agent context windows.
 * Compact enough for context efficiency; structured for readability.
 */
export function formatMd(entries: Entry[]): string {
  if (entries.length === 0) {
    return "No entries found.";
  }

  const parts: string[] = [];

  for (const entry of entries) {
    const date = entry.timestamp.slice(0, 10);
    let block = `## ${date} \u00b7 ${entry.category}\n\n`;
    block += `**${entry.summary}**\n`;

    const meta: string[] = [];
    if (entry.thread_id) meta.push(`Thread: ${entry.thread_id}`);
    if (entry.session_id) meta.push(`Session: ${entry.session_id}`);
    if (entry.agent) meta.push(`Agent: ${entry.agent}`);
    if (meta.length > 0) {
      block += `${meta.join(" \u00b7 ")}\n`;
    }

    if (entry.tags.length > 0) {
      block += `Tags: ${entry.tags.join(", ")}\n`;
    }

    if (Object.keys(entry.detail).length > 0) {
      block += `\nDetail: ${JSON.stringify(entry.detail)}\n`;
    }

    parts.push(block);
  }

  return parts.join("\n---\n\n");
}

/**
 * Formats entries as a JSON string (JSON.stringify with 2-space indent).
 */
export function formatJson(entries: Entry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Formats entries as plain text (ANSI color to be added in Phase 1B CLI).
 */
export function formatCompact(entries: Entry[]): string {
  if (entries.length === 0) {
    return "No entries found.";
  }

  return entries
    .map((e) => {
      const date = e.timestamp.slice(0, 10);
      const time = e.timestamp.slice(11, 16);
      return `[${date} ${time}] ${e.category}: ${e.summary}`;
    })
    .join("\n");
}
