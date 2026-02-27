/**
 * Post-generation validator for generated TypeScript code.
 * Purely deterministic - no LLM involved.
 * Catches known LLM generation bug patterns and optionally auto-fixes them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// =============================================================================
// Types
// =============================================================================

export interface ValidateOptions {
  fix?: boolean;
  quiet?: boolean;
}

export interface ValidationIssue {
  line: number;
  severity: 'critical' | 'high' | 'warning';
  rule: string;
  message: string;
  fix?: { oldText: string; newText: string };
}

export interface FileReport {
  filePath: string;
  issues: ValidationIssue[];
}

export interface ValidationReport {
  files: FileReport[];
  totalIssues: number;
  fixedIssues: number;
  criticalCount: number;
  highCount: number;
  warningCount: number;
}

// =============================================================================
// Rules
// =============================================================================

type Rule = (lines: string[], filePath: string) => ValidationIssue[];

/**
 * Detect ambient declarations: `export function foo(): Type;` without body.
 * Pattern: line starts with export, has function/const/let/var, ends with `;`,
 * and has no `=` or `{` before the semicolon.
 */
function ambientDeclaration(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    // export function name(...): ReturnType;
    if (/^export\s+(async\s+)?function\s+\w+\s*\(/.test(line) && line.endsWith(';') && !line.includes('{')) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'ambient-declaration',
        message: `Ambient function declaration (no body): ${line.substring(0, 80)}`,
      });
    }
    // export const name: Type;  (no = sign)
    if (/^export\s+(const|let|var)\s+\w+\s*:/.test(line) && line.endsWith(';') && !line.includes('=')) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'ambient-declaration',
        message: `Ambient variable declaration (no value): ${line.substring(0, 80)}`,
      });
    }
  }
  return issues;
}

/**
 * Detect wrong Gemini SDK class name: GoogleGenerativeAI instead of GoogleGenAI.
 */
function wrongGenaiClass(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes('GoogleGenerativeAI')) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'wrong-genai-class',
        message: 'Uses GoogleGenerativeAI (old class). Should be GoogleGenAI from @google/genai',
        fix: { oldText: 'GoogleGenerativeAI', newText: 'GoogleGenAI' },
      });
    }
    if (line.includes('@google/generative-ai')) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'wrong-genai-class',
        message: 'Uses @google/generative-ai (old package). Should be @google/genai',
        fix: { oldText: '@google/generative-ai', newText: '@google/genai' },
      });
    }
  }
  return issues;
}

/**
 * Detect old SDK API patterns: getGenerativeModel, model.startChat.
 */
function wrongGenaiApi(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes('getGenerativeModel')) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'wrong-genai-api',
        message: 'Uses getGenerativeModel (old API). Should use genai.models.generateContent() directly',
      });
    }
    if (/\.startChat\s*\(/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'wrong-genai-api',
        message: 'Uses model.startChat (old API). Should use genai.models.generateContent() with history',
      });
    }
  }
  return issues;
}

/**
 * Detect response.text() called as function instead of property.
 */
function wrongResponseText(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match response.text() but not response.textContent() or similar
    if (/response\.text\s*\(\s*\)/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'wrong-response-text',
        message: 'response.text() called as function. It is a property: response.text',
        fix: { oldText: 'response.text()', newText: 'response.text' },
      });
    }
  }
  return issues;
}

/**
 * Detect response.candidates?.[0] access pattern.
 */
function wrongFunctionCallsAccess(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes('response.candidates')) {
      issues.push({
        line: i + 1,
        severity: 'critical',
        rule: 'wrong-function-calls-access',
        message: 'Uses response.candidates (old pattern). Use response.functionCalls and response.text directly',
      });
    }
  }
  return issues;
}

/**
 * Detect double-escaped sequences in regex literals and string args.
 * Looks for \\n, \\t, \\s, \\d, \\w, \\b etc. where single backslash was intended.
 */
function doubleEscapedRegex(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // In regex literals: /pattern/ containing \\n etc.
    const regexLiterals = line.match(/\/[^/]+\//g);
    if (regexLiterals) {
      for (const regex of regexLiterals) {
        if (/\\\\[ntsdbwSDWB]/.test(regex)) {
          issues.push({
            line: i + 1,
            severity: 'high',
            rule: 'double-escaped-regex',
            message: `Double-escaped sequence in regex: ${regex.substring(0, 40)}`,
          });
        }
      }
    }

    // In string args to split/replace/match: .split('\\n') etc.
    // Match .split('...') or .split("...")
    const stringMethodMatch = line.match(/\.(split|replace|match)\s*\(\s*(['"])(.*?)\2/g);
    if (stringMethodMatch) {
      for (const m of stringMethodMatch) {
        if (/\\\\[ntsdbwSDWB]/.test(m)) {
          issues.push({
            line: i + 1,
            severity: 'high',
            rule: 'double-escaped-regex',
            message: `Double-escaped sequence in string method: ${m.substring(0, 50)}`,
          });
        }
      }
    }

    // In regular string literals containing \\n (common in template construction)
    // Be careful: only flag obvious cases like '\\n' or "\\n" standalone
    if (/['"]\\\\n['"]/.test(line) || /['"]\\\\t['"]/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'high',
        rule: 'double-escaped-regex',
        message: `Likely double-escaped newline/tab in string literal`,
      });
    }
  }
  return issues;
}

/**
 * Detect importing a symbol AND declaring it locally.
 */
function importRedeclaration(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Collect all imported symbols
  const importedSymbols = new Set<string>();
  for (const line of lines) {
    const match = line.match(/import\s+(?:type\s+)?{\s*([^}]+)\s*}\s+from/);
    if (match) {
      const symbols = match[1]!.split(',').map(s => s.trim().split(/\s+as\s+/).pop()!.trim());
      for (const sym of symbols) {
        if (sym) importedSymbols.add(sym);
      }
    }
  }

  if (importedSymbols.size === 0) return issues;

  // Check for local declarations of imported symbols
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    // Skip import lines themselves
    if (line.startsWith('import ')) continue;

    for (const sym of importedSymbols) {
      // Check for: interface Sym, class Sym, type Sym, function Sym, const Sym
      const declPattern = new RegExp(`^(export\\s+)?(interface|class|type|function|const|let|var|async\\s+function)\\s+${sym}\\b`);
      if (declPattern.test(line)) {
        issues.push({
          line: i + 1,
          severity: 'high',
          rule: 'import-redeclaration',
          message: `'${sym}' is imported AND declared locally. Remove the local declaration.`,
        });
      }
    }
  }
  return issues;
}

/**
 * Detect functions returning Promise without async keyword.
 */
function missingAsync(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // function name(...): Promise<...> without async
    if (/^\s*(export\s+)?function\s+\w+/.test(line) && /:\s*Promise\s*</.test(line) && !/async\s+function/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'high',
        rule: 'missing-async',
        message: 'Function returns Promise but is not async',
      });
    }
  }
  return issues;
}

/**
 * Detect non-existent Bun APIs.
 */
function wrongBunApis(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/Bun\.mkdir\s*\(/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'high',
        rule: 'bun-mkdir',
        message: 'Bun.mkdir() does not exist. Use fs.mkdirSync() or fs.mkdir()',
      });
    }
    if (/Bun\.file\s*\([^)]+\)\.write\s*\(/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'high',
        rule: 'bun-file-write',
        message: 'Bun.file(path).write() does not exist. Use Bun.write(path, content)',
      });
    }
    if (/Bun\.write\s*\([^,]+,[^,]+,\s*\{[^}]*append/.test(line)) {
      issues.push({
        line: i + 1,
        severity: 'high',
        rule: 'bun-write-append',
        message: 'Bun.write() does not support append option. Use fs.appendFileSync()',
      });
    }
  }
  return issues;
}

/**
 * Detect commander option format with long flag before short flag.
 */
function commanderOptionFormat(lines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match .option('--foo, -f  pattern (long before short)
    const match = line.match(/\.option\s*\(\s*['"](--.+?),\s*(-\w)/);
    if (match) {
      issues.push({
        line: i + 1,
        severity: 'warning',
        rule: 'commander-option-format',
        message: `Commander option has long flag before short flag: ${match[0].substring(0, 40)}`,
      });
    }
  }
  return issues;
}

/**
 * Detect CLI files that import commander but never call program.parse().
 */
function missingMainCall(lines: string[], filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const content = lines.join('\n');

  // Only check files that look like CLI entry points
  const isCliFile = content.includes('new Command') || content.includes('program.command(');
  if (!isCliFile) return issues;

  if (!content.includes('program.parse') && !content.includes('program.parseAsync')) {
    issues.push({
      line: 1,
      severity: 'warning',
      rule: 'missing-main-call',
      message: 'CLI file uses commander but never calls program.parse() or program.parseAsync()',
    });
  }
  return issues;
}

// =============================================================================
// All rules
// =============================================================================

const ALL_RULES: Rule[] = [
  ambientDeclaration,
  wrongGenaiClass,
  wrongGenaiApi,
  wrongResponseText,
  wrongFunctionCallsAccess,
  doubleEscapedRegex,
  importRedeclaration,
  missingAsync,
  wrongBunApis,
  commanderOptionFormat,
  missingMainCall,
];

// =============================================================================
// Main validate function
// =============================================================================

/**
 * Recursively find all .ts files in a directory.
 */
function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...findTsFiles(full));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  } catch {
    // directory doesn't exist
  }
  return results;
}

/**
 * Apply auto-fixes to file content.
 * Returns the fixed content and count of fixes applied.
 */
function applyFixes(content: string, issues: ValidationIssue[]): { content: string; fixCount: number } {
  let fixCount = 0;
  let result = content;

  for (const issue of issues) {
    if (issue.fix) {
      const before = result;
      result = result.replaceAll(issue.fix.oldText, issue.fix.newText);
      if (result !== before) {
        fixCount++;
      }
    }
  }

  return { content: result, fixCount };
}

/**
 * Validate all TypeScript files in a directory.
 */
export async function validate(targetDir: string, options?: ValidateOptions): Promise<ValidationReport> {
  const fix = options?.fix ?? false;
  const quiet = options?.quiet ?? false;

  const files = findTsFiles(targetDir);
  const report: ValidationReport = {
    files: [],
    totalIssues: 0,
    fixedIssues: 0,
    criticalCount: 0,
    highCount: 0,
    warningCount: 0,
  };

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const issues: ValidationIssue[] = [];

    for (const rule of ALL_RULES) {
      issues.push(...rule(lines, filePath));
    }

    if (issues.length > 0) {
      const fileReport: FileReport = { filePath, issues };
      report.files.push(fileReport);
      report.totalIssues += issues.length;

      for (const issue of issues) {
        if (issue.severity === 'critical') report.criticalCount++;
        else if (issue.severity === 'high') report.highCount++;
        else if (issue.severity === 'warning') report.warningCount++;
      }

      // Apply fixes if requested
      if (fix) {
        const { content: fixedContent, fixCount } = applyFixes(content, issues);
        if (fixCount > 0) {
          fs.writeFileSync(filePath, fixedContent, 'utf-8');
          report.fixedIssues += fixCount;
        }
      }

      // Print issues
      if (!quiet) {
        const relPath = path.relative(process.cwd(), filePath);
        for (const issue of issues) {
          const icon = issue.severity === 'critical' ? 'CRIT' : issue.severity === 'high' ? 'HIGH' : 'WARN';
          const fixTag = issue.fix && fix ? ' [FIXED]' : issue.fix ? ' [fixable]' : '';
          console.log(`  ${relPath}:${issue.line}  ${icon}  ${issue.rule}: ${issue.message}${fixTag}`);
        }
      }
    }
  }

  // Print summary
  if (!quiet) {
    console.log('');
    console.log(`Scanned ${files.length} files, found ${report.totalIssues} issues`);
    console.log(`  Critical: ${report.criticalCount}  High: ${report.highCount}  Warning: ${report.warningCount}`);
    if (fix) {
      console.log(`  Auto-fixed: ${report.fixedIssues}`);
    }
  }

  return report;
}
