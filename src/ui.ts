/**
 * UI Module - Cyberpunk Terminal Aesthetic
 *
 * A distinctive CLI experience with neon colors, ASCII art,
 * animated spinners, and box-framed outputs.
 */

import * as fs from 'fs';
import * as path from 'path';

// Read version from package.json
function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = getVersion();

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Cyberpunk color palette
export const colors = {
  cyan: (s: string) => `\x1b[96m${s}${RESET}`,
  magenta: (s: string) => `\x1b[95m${s}${RESET}`,
  yellow: (s: string) => `\x1b[93m${s}${RESET}`,
  green: (s: string) => `\x1b[92m${s}${RESET}`,
  red: (s: string) => `\x1b[91m${s}${RESET}`,
  blue: (s: string) => `\x1b[94m${s}${RESET}`,
  gray: (s: string) => `\x1b[90m${s}${RESET}`,
  white: (s: string) => `\x1b[97m${s}${RESET}`,
  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,

  // Gradient effect (cyan to magenta)
  gradient: (s: string) => {
    const chars = s.split('');
    const mid = Math.floor(chars.length / 2);
    return (
      chars
        .map((c, i) => {
          if (i < mid) return `\x1b[96m${c}`;
          return `\x1b[95m${c}`;
        })
        .join('') + RESET
    );
  },
};

// Box drawing characters (Unicode)
const box = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  verticalRight: '├',
  verticalLeft: '┤',
};

// Helper to pad a line to exact width
function logoLine(content: string, width: number): string {
  const stripped = stripAnsi(content);
  const pad = width - stripped.length;
  return colors.cyan('║') + content + ' '.repeat(Math.max(0, pad)) + colors.cyan('║');
}

// ASCII Art Logo - VCKIT in cyan, DB in magenta
function buildLogo(): string {
  const W = 63; // inner width
  const hr = colors.cyan('═'.repeat(W));

  return `
${colors.cyan('╔')}${hr}${colors.cyan('╗')}
${logoLine(' ' + colors.cyan('██╗   ██╗ ██████╗██╗  ██╗██╗████████╗') + '  ' + colors.magenta('██████╗ ██████╗') + ' ', W)}
${logoLine(' ' + colors.cyan('██║   ██║██╔════╝██║ ██╔╝██║╚══██╔══╝') + '  ' + colors.magenta('██╔══██╗██╔══██╗'), W)}
${logoLine(' ' + colors.cyan('██║   ██║██║     █████╔╝ ██║   ██║') + '     ' + colors.magenta('██║  ██║██████╔╝'), W)}
${logoLine(' ' + colors.cyan('╚██╗ ██╔╝██║     ██╔═██╗ ██║   ██║') + '     ' + colors.magenta('██║  ██║██╔══██╗'), W)}
${logoLine(' ' + colors.cyan(' ╚████╔╝ ╚██████╗██║  ██╗██║   ██║') + '     ' + colors.magenta('██████╔╝██████╔╝'), W)}
${logoLine(' ' + colors.cyan('  ╚═══╝   ╚═════╝╚═╝  ╚═╝╚═╝   ╚═╝') + '     ' + colors.magenta('╚═════╝ ╚═════╝') + ' ', W)}
${colors.cyan('╠')}${hr}${colors.cyan('╣')}
${logoLine('  ' + colors.gray('Database Management Tools') + '                     ' + colors.magenta('v' + VERSION) + ' ', W)}
${colors.cyan('╚')}${hr}${colors.cyan('╝')}`;
}

const LOGO = buildLogo();

// Compact header for commands
const HEADER = `
${colors.cyan('┌─')} ${colors.gradient('VCKIT DB')} ${colors.cyan('─────────────────────────────────────────────┐')}
`;

// Spinner frames (cyberpunk style)
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_FRAMES_ALT = ['◐', '◓', '◑', '◒'];
const SPINNER_FRAMES_DOTS = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

export class Spinner {
  private frameIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string;
  private frames: string[];

  constructor(message: string, style: 'default' | 'alt' | 'dots' = 'dots') {
    this.message = message;
    this.frames =
      style === 'alt'
        ? SPINNER_FRAMES_ALT
        : style === 'dots'
          ? SPINNER_FRAMES_DOTS
          : SPINNER_FRAMES;
  }

  start(): void {
    process.stdout.write('\x1b[?25l'); // Hide cursor
    this.render();
    this.interval = setInterval(() => this.render(), 80);
  }

  private render(): void {
    const frame = colors.cyan(this.frames[this.frameIndex]);
    process.stdout.write(`\r${frame} ${colors.white(this.message)}`);
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
  }

  update(message: string): void {
    this.message = message;
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r\x1b[K'); // Clear line
    process.stdout.write('\x1b[?25h'); // Show cursor
    if (finalMessage) {
      console.log(finalMessage);
    }
  }

  success(message: string): void {
    this.stop(`${colors.green('✔')} ${colors.white(message)}`);
  }

  fail(message: string): void {
    this.stop(`${colors.red('✖')} ${colors.white(message)}`);
  }

  info(message: string): void {
    this.stop(`${colors.cyan('ℹ')} ${colors.white(message)}`);
  }
}

// Progress bar
export class ProgressBar {
  private total: number;
  private current = 0;
  private width: number;
  private label: string;

  constructor(total: number, label = '', width = 30) {
    this.total = total;
    this.width = width;
    this.label = label;
  }

  update(current: number): void {
    this.current = current;
    this.render();
  }

  increment(): void {
    this.current++;
    this.render();
  }

  private render(): void {
    const percent = Math.min(100, Math.round((this.current / this.total) * 100));
    const filled = Math.round((this.current / this.total) * this.width);
    const empty = this.width - filled;

    const bar = colors.cyan('█'.repeat(filled)) + colors.gray('░'.repeat(empty));
    const percentStr = colors.magenta(`${percent.toString().padStart(3)}%`);

    process.stdout.write(
      `\r${this.label ? colors.white(this.label + ' ') : ''}${bar} ${percentStr}`
    );
  }

  complete(): void {
    this.current = this.total;
    this.render();
    console.log();
  }
}

// Box drawing utilities
export function drawBox(content: string[], title?: string, width = 60): string {
  const lines: string[] = [];
  const innerWidth = width - 4;

  // Top border with optional title
  if (title) {
    const titlePadded = ` ${title} `;
    const titleWidth = visualWidth(titlePadded);
    const leftPad = Math.floor((width - 2 - titleWidth) / 2);
    const rightPad = width - 2 - titleWidth - leftPad;
    lines.push(
      colors.cyan(box.topLeft) +
        colors.cyan(box.horizontal.repeat(Math.max(0, leftPad))) +
        colors.magenta(titlePadded) +
        colors.cyan(box.horizontal.repeat(Math.max(0, rightPad))) +
        colors.cyan(box.topRight)
    );
  } else {
    lines.push(colors.cyan(box.topLeft + box.horizontal.repeat(width - 2) + box.topRight));
  }

  // Content lines - handle newlines, wrapping, and trim
  for (const rawLine of content) {
    // Split on newlines and process each sub-line
    const subLines = rawLine.split('\n');
    for (const line of subLines) {
      const trimmedLine = line.trimEnd();
      if (trimmedLine === '' && subLines.length > 1) continue; // Skip empty lines from splits

      // Wrap long lines
      const wrappedLines = wrapText(trimmedLine, innerWidth);
      for (const wrappedLine of wrappedLines) {
        const stripped = stripAnsi(wrappedLine);
        const padding = innerWidth - stripped.length;
        const hasColor = wrappedLine !== stripped;

        // Get color code if present
        let colorCode = '';
        let resetCode = '';
        if (hasColor) {
          // eslint-disable-next-line no-control-regex
          const match = wrappedLine.match(/^(\x1b\[[0-9;]*m)/);
          if (match) {
            colorCode = match[1];
            resetCode = '\x1b[0m';
          }
        }

        // Build line with color applied to text only, padding uncolored
        const content = colorCode + stripped + resetCode + ' '.repeat(Math.max(0, padding));
        lines.push(colors.cyan(box.vertical) + ' ' + content + ' ' + colors.cyan(box.vertical));
      }
    }
  }

  // Bottom border
  lines.push(colors.cyan(box.bottomLeft + box.horizontal.repeat(width - 2) + box.bottomRight));

  return lines.join('\n');
}

// Strip ANSI codes for length calculation
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Calculate visual width (accounts for wide characters like emojis)
function visualWidth(str: string): number {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    const code = char.codePointAt(0) || 0;
    // Emojis and other wide characters (rough heuristic)
    if (
      code > 0x1f000 || // Emojis
      (code >= 0x2600 && code <= 0x27bf) || // Misc symbols
      (code >= 0x1f300 && code <= 0x1f9ff)
    ) {
      // More emojis
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// Wrap text to fit within a given width
function wrapText(text: string, maxWidth: number): string[] {
  const stripped = stripAnsi(text);
  if (visualWidth(stripped) <= maxWidth) {
    return [text];
  }

  // For colored text, we need to work with the stripped version for wrapping
  // but preserve the color codes - for simplicity, just wrap the stripped text
  // and reapply the color if the original had color
  const hasColor = text !== stripped;
  const words = stripped.split(' ').filter((w) => w.length > 0); // Filter empty words
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = visualWidth(word);
    if (currentLine.length === 0) {
      currentLine = word;
      currentWidth = wordWidth;
    } else if (currentWidth + 1 + wordWidth <= maxWidth) {
      currentLine += ' ' + word;
      currentWidth += 1 + wordWidth;
    } else {
      lines.push(currentLine);
      currentLine = word;
      currentWidth = wordWidth;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  // Reapply color if original had it (simple case: wrap in same color)
  if (hasColor && text.startsWith('\x1b[')) {
    // eslint-disable-next-line no-control-regex
    const colorMatch = text.match(/^(\x1b\[[0-9;]*m)/);
    if (colorMatch) {
      return lines.map((l) => colorMatch[1] + l + '\x1b[0m');
    }
  }

  return lines;
}

// Section header
export function sectionHeader(title: string): string {
  const line = colors.gray('─'.repeat(50));
  return `\n${line}\n  ${colors.cyan('▸')} ${colors.bold(colors.white(title))}\n${line}`;
}

// Key-value display
export function keyValue(key: string, value: string): string {
  return `  ${colors.gray(key + ':')} ${colors.white(value)}`;
}

// Table display
export function table(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => stripAnsi(r[i] || '').length));
    return Math.max(stripAnsi(h).length, maxRow);
  });

  const lines: string[] = [];

  // Header
  const headerLine = headers
    .map((h, i) => colors.cyan(h.padEnd(colWidths[i])))
    .join(colors.gray(' │ '));
  lines.push('  ' + headerLine);

  // Separator
  const sepLine = colWidths.map((w) => '─'.repeat(w)).join('─┼─');
  lines.push('  ' + colors.gray(sepLine));

  // Rows
  for (const row of rows) {
    const rowLine = row
      .map((cell, i) => {
        const stripped = stripAnsi(cell);
        const padding = colWidths[i] - stripped.length;
        return cell + ' '.repeat(Math.max(0, padding));
      })
      .join(colors.gray(' │ '));
    lines.push('  ' + rowLine);
  }

  return lines.join('\n');
}

// Status indicators
export const status = {
  success: (msg: string) => console.log(`${colors.green('✔')} ${msg}`),
  error: (msg: string) => console.log(`${colors.red('✖')} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow('⚠')} ${msg}`),
  info: (msg: string) => console.log(`${colors.cyan('ℹ')} ${msg}`),
  step: (msg: string) => console.log(`${colors.magenta('▸')} ${msg}`),
  done: (msg: string) => console.log(`${colors.green('◉')} ${colors.bold(msg)}`),
};

// Print logo
export function printLogo(): void {
  console.log(LOGO);
}

// Print header
export function printHeader(): void {
  console.log(HEADER);
}

// Divider
export function divider(): void {
  console.log(colors.gray('─'.repeat(60)));
}

// Empty line
export function spacer(): void {
  console.log();
}

// Highlight important text
export function highlight(text: string): string {
  return colors.bold(colors.yellow(text));
}

// Code/command display
export function code(text: string): string {
  return colors.gray('`') + colors.cyan(text) + colors.gray('`');
}

// Result summary box
export function resultBox(
  title: string,
  items: Array<{
    label: string;
    value: string;
    color?: 'green' | 'red' | 'yellow' | 'cyan' | 'magenta';
  }>
): void {
  const content = items.map((item) => {
    const colorFn = item.color ? colors[item.color] : colors.white;
    return `${colors.gray(item.label + ':')} ${colorFn(item.value)}`;
  });
  console.log(drawBox(content, title));
}

// Next steps box
export function nextSteps(steps: string[]): void {
  const content = steps.map((step, i) => `${colors.cyan((i + 1).toString() + '.')} ${step}`);
  console.log(drawBox(content, '📋 NEXT STEPS'));
}

// Error display
export function errorBox(title: string, message: string, details?: string[]): void {
  // Clean up the message - normalize whitespace and trim
  const cleanMessage = message.replace(/\s+/g, ' ').trim();
  const content = [colors.red(cleanMessage)];
  if (details) {
    content.push('');
    content.push(...details.map((d) => colors.gray('  ' + d)));
  }
  console.log(drawBox(content, `⚠ ${title}`));
}

// Operation icons
const operationIcons: Record<string, string> = {
  'encryption key rotation': '🔐',
  'database backup': '📦',
  'database restore': '📥',
  'database verification': '🔍',
  'password change': '🔑',
};

// Banner for major operations (matches KEY GENERATED / NEXT STEPS style)
export async function operationBanner(operation: string): Promise<void> {
  const icon = operationIcons[operation.toLowerCase()] || '⚡';
  const title = ` ${icon} ${operation.toUpperCase()} `;
  const titleWidth = visualWidth(title);
  const width = 60;
  const innerWidth = width - 2;
  const leftPad = Math.floor((innerWidth - titleWidth) / 2);
  const rightPad = innerWidth - titleWidth - leftPad;

  console.log();
  console.log(
    colors.cyan(box.topLeft) +
      colors.cyan(box.horizontal.repeat(Math.max(0, leftPad))) +
      colors.magenta(title) +
      colors.cyan(box.horizontal.repeat(Math.max(0, rightPad))) +
      colors.cyan(box.topRight)
  );
  console.log();
}
