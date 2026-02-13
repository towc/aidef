/**
 * Content Viewer Component
 *
 * Displays node content, questions, and allows answering questions.
 */

import { color, horizontalLine, box } from "./terminal.js";
import { readPlanFile, readContextFile, readQuestionsFile } from "../../compiler/writer.js";
import type { TreeNode } from "./tree.js";
import type { ChildContext, NodeQuestions } from "../../types/index.js";

/**
 * Content to display for a node
 */
export interface NodeContent {
  /** The spec content */
  spec: string | null;
  /** The context (if leaf) */
  context: ChildContext | null;
  /** Questions (if any) */
  questions: NodeQuestions | null;
}

/**
 * Load content for a node
 */
export async function loadNodeContent(
  aidPlanDir: string,
  nodePath: string
): Promise<NodeContent> {
  const [spec, context, questions] = await Promise.all([
    readPlanFile(aidPlanDir, nodePath),
    readContextFile(aidPlanDir, nodePath),
    readQuestionsFile(aidPlanDir, nodePath),
  ]);

  return { spec, context, questions };
}

/**
 * Render spec content with syntax highlighting
 */
export function renderSpec(spec: string, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const line of spec.split("\n")) {
    // Simple syntax highlighting for .aid/.plan.aid format
    let rendered = line;

    // Comments
    if (line.trim().startsWith("//") || line.trim().startsWith("/*")) {
      rendered = color.gray(line);
    }
    // Module blocks
    else if (line.match(/^\s*\w+\s*\{/)) {
      const match = line.match(/^(\s*)(\w+)(\s*\{.*)$/);
      if (match) {
        rendered = match[1] + color.cyan(match[2]) + match[3];
      }
    }
    // Parameters (key=value)
    else if (line.match(/^\s*\w+=.+;/)) {
      const match = line.match(/^(\s*)(\w+)(=)(.+)(;.*)$/);
      if (match) {
        rendered = match[1] + color.magenta(match[2]) + match[3] + color.yellow(match[4]) + match[5];
      }
    }
    // Closing brace
    else if (line.trim() === "}") {
      rendered = line;
    }
    // Prose content
    else if (line.trim()) {
      rendered = line;
    }

    lines.push(rendered);
  }

  return lines;
}

/**
 * Render context for display
 */
export function renderContext(context: ChildContext): string[] {
  const lines: string[] = [];

  lines.push(color.bold("=== Context ==="));
  lines.push("");

  // Interfaces
  const interfaceNames = Object.keys(context.interfaces);
  if (interfaceNames.length > 0) {
    lines.push(color.cyan("Interfaces:"));
    for (const name of interfaceNames) {
      const iface = context.interfaces[name];
      lines.push(`  ${color.bold(name)} (from ${color.dim(iface.source)})`);
    }
    lines.push("");
  }

  // Constraints
  if (context.constraints.length > 0) {
    lines.push(color.cyan("Constraints:"));
    for (const c of context.constraints) {
      lines.push(`  - ${c.rule} ${color.dim(`(${c.source})`)}`);
    }
    lines.push("");
  }

  // Utilities
  if (context.utilities.length > 0) {
    lines.push(color.cyan("Utilities:"));
    for (const u of context.utilities) {
      lines.push(`  - ${color.bold(u.name)}: ${u.signature}`);
      lines.push(`    at ${color.dim(u.location)}`);
    }
    lines.push("");
  }

  if (lines.length === 2) {
    lines.push(color.dim("  (empty context)"));
  }

  return lines;
}

/**
 * Render questions for display
 */
export function renderQuestions(questions: NodeQuestions): string[] {
  const lines: string[] = [];

  lines.push(color.bold("=== Questions ==="));
  lines.push("");

  if (questions.questions.length === 0 && questions.considerations.length === 0) {
    lines.push(color.dim("  (no questions)"));
    return lines;
  }

  // Questions
  for (let i = 0; i < questions.questions.length; i++) {
    const q = questions.questions[i];
    const answered = !!q.answer;

    const status = answered
      ? color.green("[answered]")
      : color.yellow("[unanswered]");

    lines.push(`${i + 1}. ${status} ${color.bold(q.question)}`);
    lines.push(`   ${color.dim("Context:")} ${q.context}`);
    lines.push(`   ${color.dim("Assumption:")} ${q.assumption}`);
    lines.push(`   ${color.dim("Impact:")} ${q.impact}`);

    if (q.options && q.options.length > 0) {
      lines.push(`   ${color.dim("Options:")}`);
      for (const opt of q.options) {
        lines.push(`     - ${opt.label}${opt.description ? `: ${opt.description}` : ""}`);
      }
    }

    if (answered) {
      lines.push(`   ${color.green("Answer:")} ${q.answer}`);
    }

    lines.push("");
  }

  // Considerations
  if (questions.considerations.length > 0) {
    lines.push(color.cyan("Considerations:"));
    for (const c of questions.considerations) {
      const blocking = c.blocking ? color.red("[blocking]") : color.dim("[note]");
      lines.push(`  ${blocking} ${c.note}`);
    }
  }

  return lines;
}

/**
 * View mode for the content pane
 */
export type ViewMode = "spec" | "context" | "questions";

/**
 * Render full content view
 */
export function renderContentView(
  node: TreeNode,
  content: NodeContent,
  mode: ViewMode,
  scrollOffset: number,
  height: number,
  width: number
): string[] {
  const lines: string[] = [];

  // Header
  const header = `${color.bold(node.nodePath)}${node.isLeaf ? color.green(" [leaf]") : ""}`;
  lines.push(header);
  lines.push(horizontalLine(width - 2));

  // Tabs
  const tabs = [
    mode === "spec" ? color.inverse(" Spec ") : " Spec ",
    mode === "context" ? color.inverse(" Context ") : " Context ",
    mode === "questions" ? color.inverse(" Questions ") : " Questions ",
  ].join(" | ");
  lines.push(tabs);
  lines.push(horizontalLine(width - 2));

  // Content based on mode
  let contentLines: string[] = [];

  switch (mode) {
    case "spec":
      if (content.spec) {
        contentLines = renderSpec(content.spec, width - 4);
      } else {
        contentLines = [color.dim("  (no spec found)")];
      }
      break;

    case "context":
      if (content.context) {
        contentLines = renderContext(content.context);
      } else {
        contentLines = [color.dim("  (no context - not a leaf node)")];
      }
      break;

    case "questions":
      if (content.questions) {
        contentLines = renderQuestions(content.questions);
      } else {
        contentLines = [color.dim("  (no questions)")];
      }
      break;
  }

  // Apply scroll offset
  const visibleHeight = height - lines.length - 1; // -1 for bottom status
  const visibleContent = contentLines.slice(
    scrollOffset,
    scrollOffset + visibleHeight
  );

  lines.push(...visibleContent);

  // Pad to fill height
  while (lines.length < height - 1) {
    lines.push("");
  }

  // Scroll indicator
  if (contentLines.length > visibleHeight) {
    const scrollInfo = `[${scrollOffset + 1}-${Math.min(scrollOffset + visibleHeight, contentLines.length)}/${contentLines.length}]`;
    lines.push(color.dim(scrollInfo));
  } else {
    lines.push("");
  }

  return lines;
}
