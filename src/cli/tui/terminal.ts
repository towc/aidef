/**
 * Terminal Utilities
 *
 * Low-level terminal control for the TUI.
 */

// ANSI escape codes
export const ANSI = {
  // Cursor
  cursorUp: (n = 1) => `\x1b[${n}A`,
  cursorDown: (n = 1) => `\x1b[${n}B`,
  cursorForward: (n = 1) => `\x1b[${n}C`,
  cursorBack: (n = 1) => `\x1b[${n}D`,
  cursorTo: (row: number, col: number) => `\x1b[${row};${col}H`,
  cursorHome: "\x1b[H",
  cursorHide: "\x1b[?25l",
  cursorShow: "\x1b[?25h",
  saveCursor: "\x1b[s",
  restoreCursor: "\x1b[u",

  // Erase
  clearScreen: "\x1b[2J",
  clearLine: "\x1b[2K",
  clearToEnd: "\x1b[0J",
  clearToLineEnd: "\x1b[0K",

  // Colors
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  inverse: "\x1b[7m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

/**
 * Color helper functions
 */
export const color = {
  bold: (s: string) => `${ANSI.bold}${s}${ANSI.reset}`,
  dim: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
  red: (s: string) => `${ANSI.red}${s}${ANSI.reset}`,
  green: (s: string) => `${ANSI.green}${s}${ANSI.reset}`,
  yellow: (s: string) => `${ANSI.yellow}${s}${ANSI.reset}`,
  blue: (s: string) => `${ANSI.blue}${s}${ANSI.reset}`,
  cyan: (s: string) => `${ANSI.cyan}${s}${ANSI.reset}`,
  magenta: (s: string) => `${ANSI.magenta}${s}${ANSI.reset}`,
  gray: (s: string) => `${ANSI.gray}${s}${ANSI.reset}`,
  inverse: (s: string) => `${ANSI.inverse}${s}${ANSI.reset}`,
};

/**
 * Get terminal size
 */
export function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

/**
 * Write to stdout without newline
 */
export function write(text: string): void {
  process.stdout.write(text);
}

/**
 * Clear screen and move cursor to top
 */
export function clearScreen(): void {
  write(ANSI.clearScreen + ANSI.cursorHome);
}

/**
 * Move cursor to position (1-indexed)
 */
export function moveTo(row: number, col: number): void {
  write(ANSI.cursorTo(row, col));
}

/**
 * Hide cursor
 */
export function hideCursor(): void {
  write(ANSI.cursorHide);
}

/**
 * Show cursor
 */
export function showCursor(): void {
  write(ANSI.cursorShow);
}

/**
 * Enable raw mode for keyboard input
 */
export function enableRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
}

/**
 * Disable raw mode
 */
export function disableRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

/**
 * Key event types
 */
export interface KeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  raw: string;
}

/**
 * Parse keyboard input
 */
export function parseKey(data: Buffer): KeyEvent {
  const str = data.toString();

  const event: KeyEvent = {
    name: "",
    ctrl: false,
    shift: false,
    meta: false,
    raw: str,
  };

  // Control characters
  if (str.length === 1 && str.charCodeAt(0) < 32) {
    event.ctrl = true;
    event.name = String.fromCharCode(str.charCodeAt(0) + 64).toLowerCase();
    return event;
  }

  // Escape sequences
  if (str.startsWith("\x1b")) {
    if (str === "\x1b[A") event.name = "up";
    else if (str === "\x1b[B") event.name = "down";
    else if (str === "\x1b[C") event.name = "right";
    else if (str === "\x1b[D") event.name = "left";
    else if (str === "\x1b[H") event.name = "home";
    else if (str === "\x1b[F") event.name = "end";
    else if (str === "\x1b[5~") event.name = "pageup";
    else if (str === "\x1b[6~") event.name = "pagedown";
    else if (str === "\x1b") event.name = "escape";
    else event.name = "unknown";
    return event;
  }

  // Regular characters
  if (str === "\r" || str === "\n") event.name = "return";
  else if (str === "\t") event.name = "tab";
  else if (str === "\x7f" || str === "\b") event.name = "backspace";
  else if (str === " ") event.name = "space";
  else event.name = str;

  return event;
}

/**
 * Box drawing characters
 */
export const box = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeRight: "├",
  teeLeft: "┤",
  teeDown: "┬",
  teeUp: "┴",
  cross: "┼",
};

/**
 * Draw a horizontal line
 */
export function horizontalLine(width: number, char = box.horizontal): string {
  return char.repeat(width);
}

/**
 * Draw a box around text
 */
export function drawBox(
  title: string,
  content: string[],
  width: number
): string[] {
  const lines: string[] = [];
  const innerWidth = width - 2;

  // Top border with title
  const titlePart = title ? ` ${title} ` : "";
  const remaining = innerWidth - titlePart.length;
  const leftPad = Math.floor(remaining / 2);
  const rightPad = remaining - leftPad;
  lines.push(
    box.topLeft +
      horizontalLine(leftPad) +
      titlePart +
      horizontalLine(rightPad) +
      box.topRight
  );

  // Content
  for (const line of content) {
    const stripped = stripAnsi(line);
    const padding = innerWidth - stripped.length;
    if (padding >= 0) {
      lines.push(box.vertical + line + " ".repeat(padding) + box.vertical);
    } else {
      // Truncate
      lines.push(box.vertical + truncate(line, innerWidth) + box.vertical);
    }
  }

  // Bottom border
  lines.push(box.bottomLeft + horizontalLine(innerWidth) + box.bottomRight);

  return lines;
}

/**
 * Strip ANSI codes from string
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= maxLength) return str;

  // This is a simplified truncation that doesn't handle ANSI perfectly
  // but works for our use case
  let visible = 0;
  let result = "";
  let inEscape = false;

  for (const char of str) {
    if (char === "\x1b") {
      inEscape = true;
      result += char;
    } else if (inEscape) {
      result += char;
      if (char === "m") inEscape = false;
    } else {
      if (visible >= maxLength - 1) {
        result += "…";
        break;
      }
      result += char;
      visible++;
    }
  }

  return result + ANSI.reset;
}
