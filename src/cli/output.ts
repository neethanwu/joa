const enabled = !process.env.NO_COLOR && process.stdout.isTTY === true;

function wrap(code: string, text: string): string {
  return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const dim = (t: string): string => wrap("2", t);
export const bold = (t: string): string => wrap("1", t);
export const green = (t: string): string => wrap("32", t);
export const red = (t: string): string => wrap("31", t);
export const yellow = (t: string): string => wrap("33", t);
export const cyan = (t: string): string => wrap("36", t);

/**
 * Colorizes a compact-formatted line.
 * Input format: "[YYYY-MM-DD HH:mm] category: summary"
 */
export function colorizeCompactLine(line: string): string {
  if (!enabled) return line;

  const match = line.match(/^(\[[\d-]+ [\d:]+\]) ([^:]+): (.+)$/);
  if (!match?.[1] || !match[2]) return line;
  return `${dim(match[1])} ${cyan(match[2])}: ${match[3] ?? ""}`;
}
