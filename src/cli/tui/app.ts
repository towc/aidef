/**
 * TUI Application
 *
 * Main application for the --browse mode.
 */

import { join } from "node:path";
import {
  clearScreen,
  hideCursor,
  showCursor,
  enableRawMode,
  disableRawMode,
  write,
  moveTo,
  parseKey,
  getTerminalSize,
  color,
  horizontalLine,
  box,
  ANSI,
  type KeyEvent,
} from "./terminal.js";
import {
  buildTree,
  flattenTree,
  renderTreeNode,
  countNodes,
  countLeaves,
  countQuestions,
  type TreeNode,
} from "./tree.js";
import {
  loadNodeContent,
  renderContentView,
  type ViewMode,
  type NodeContent,
} from "./viewer.js";
import { runBuild } from "../../generator/index.js";
import { getProvider } from "../../providers/index.js";

/**
 * TUI Application State
 */
interface AppState {
  /** Root of the tree */
  tree: TreeNode | null;
  /** Flattened visible nodes */
  visibleNodes: TreeNode[];
  /** Currently selected node index */
  selectedIndex: number;
  /** Content of selected node */
  content: NodeContent | null;
  /** Current view mode */
  viewMode: ViewMode;
  /** Scroll offset in content view */
  scrollOffset: number;
  /** Whether to show help */
  showHelp: boolean;
  /** Status message */
  statusMessage: string;
  /** Whether app is running */
  running: boolean;
  /** Active pane (tree or content) */
  activePane: "tree" | "content";
}

/**
 * Run the TUI application
 */
export async function runTui(aidPlanDir: string, buildDir: string): Promise<void> {
  // Initialize state
  const state: AppState = {
    tree: null,
    visibleNodes: [],
    selectedIndex: 0,
    content: null,
    viewMode: "spec",
    scrollOffset: 0,
    showHelp: false,
    statusMessage: "Loading...",
    running: true,
    activePane: "tree",
  };

  // Load tree
  state.tree = await buildTree(aidPlanDir);

  if (!state.tree) {
    console.log("No compiled nodes found. Run compilation first: aid");
    return;
  }

  state.visibleNodes = flattenTree(state.tree);
  state.statusMessage = "Ready. Press ? for help.";

  // Load initial content
  if (state.visibleNodes.length > 0) {
    state.content = await loadNodeContent(
      aidPlanDir,
      state.visibleNodes[0].nodePath
    );
  }

  // Setup terminal
  enableRawMode();
  hideCursor();

  // Handle resize
  process.stdout.on("resize", () => render(state, aidPlanDir, buildDir));

  // Handle input
  process.stdin.on("data", async (data) => {
    const key = parseKey(data);
    await handleKey(key, state, aidPlanDir, buildDir);

    if (state.running) {
      render(state, aidPlanDir, buildDir);
    }
  });

  // Initial render
  render(state, aidPlanDir, buildDir);

  // Wait for exit
  return new Promise((resolve) => {
    const checkRunning = setInterval(() => {
      if (!state.running) {
        clearInterval(checkRunning);
        cleanup();
        resolve();
      }
    }, 100);
  });
}

/**
 * Cleanup terminal state
 */
function cleanup(): void {
  showCursor();
  disableRawMode();
  clearScreen();
}

/**
 * Handle keyboard input
 */
async function handleKey(
  key: KeyEvent,
  state: AppState,
  aidPlanDir: string,
  buildDir: string
): Promise<void> {
  // Global keys
  if (key.name === "q" || (key.ctrl && key.name === "c")) {
    state.running = false;
    return;
  }

  if (key.name === "?") {
    state.showHelp = !state.showHelp;
    return;
  }

  if (state.showHelp) {
    // Any key closes help
    state.showHelp = false;
    return;
  }

  // Tab to switch panes
  if (key.name === "tab") {
    state.activePane = state.activePane === "tree" ? "content" : "tree";
    state.scrollOffset = 0;
    return;
  }

  // View mode keys (1, 2, 3)
  if (key.name === "1") {
    state.viewMode = "spec";
    state.scrollOffset = 0;
    return;
  }
  if (key.name === "2") {
    state.viewMode = "context";
    state.scrollOffset = 0;
    return;
  }
  if (key.name === "3") {
    state.viewMode = "questions";
    state.scrollOffset = 0;
    return;
  }

  // Build key
  if (key.name === "b") {
    state.statusMessage = "Building...";
    render(state, aidPlanDir, buildDir);

    try {
      const provider = getProvider("anthropic");
      const result = await runBuild(provider, aidPlanDir, buildDir, {
        verbose: false,
        parallelism: 3,
      });

      if (result.failureCount === 0) {
        state.statusMessage = color.green(
          `Build complete: ${result.successCount} nodes, ${result.files.length} files`
        );
      } else {
        state.statusMessage = color.red(
          `Build: ${result.successCount} ok, ${result.failureCount} failed`
        );
      }
    } catch (err) {
      state.statusMessage = color.red(`Build failed: ${err}`);
    }
    return;
  }

  // Refresh key
  if (key.name === "r") {
    state.statusMessage = "Refreshing...";
    render(state, aidPlanDir, buildDir);

    state.tree = await buildTree(aidPlanDir);
    if (state.tree) {
      state.visibleNodes = flattenTree(state.tree);
      state.selectedIndex = Math.min(
        state.selectedIndex,
        state.visibleNodes.length - 1
      );
      if (state.visibleNodes.length > 0) {
        state.content = await loadNodeContent(
          aidPlanDir,
          state.visibleNodes[state.selectedIndex].nodePath
        );
      }
    }
    state.statusMessage = "Refreshed.";
    return;
  }

  // Tree pane navigation
  if (state.activePane === "tree") {
    if (key.name === "up" || key.name === "k") {
      if (state.selectedIndex > 0) {
        state.selectedIndex--;
        state.content = await loadNodeContent(
          aidPlanDir,
          state.visibleNodes[state.selectedIndex].nodePath
        );
        state.scrollOffset = 0;
      }
    } else if (key.name === "down" || key.name === "j") {
      if (state.selectedIndex < state.visibleNodes.length - 1) {
        state.selectedIndex++;
        state.content = await loadNodeContent(
          aidPlanDir,
          state.visibleNodes[state.selectedIndex].nodePath
        );
        state.scrollOffset = 0;
      }
    } else if (key.name === "return" || key.name === "right" || key.name === "l") {
      // Expand/collapse or enter node
      const node = state.visibleNodes[state.selectedIndex];
      if (node.children.length > 0) {
        node.expanded = !node.expanded;
        state.visibleNodes = flattenTree(state.tree!);
      }
    } else if (key.name === "left" || key.name === "h") {
      // Collapse or go to parent
      const node = state.visibleNodes[state.selectedIndex];
      if (node.expanded && node.children.length > 0) {
        node.expanded = false;
        state.visibleNodes = flattenTree(state.tree!);
      }
    }
  }

  // Content pane scrolling
  if (state.activePane === "content") {
    if (key.name === "up" || key.name === "k") {
      if (state.scrollOffset > 0) {
        state.scrollOffset--;
      }
    } else if (key.name === "down" || key.name === "j") {
      state.scrollOffset++;
    } else if (key.name === "pageup") {
      state.scrollOffset = Math.max(0, state.scrollOffset - 10);
    } else if (key.name === "pagedown") {
      state.scrollOffset += 10;
    } else if (key.name === "home") {
      state.scrollOffset = 0;
    }
  }
}

/**
 * Render the UI
 */
function render(
  state: AppState,
  aidPlanDir: string,
  buildDir: string
): void {
  const { rows, cols } = getTerminalSize();

  clearScreen();

  // Layout: tree on left (30%), content on right (70%)
  const treeWidth = Math.floor(cols * 0.3);
  const contentWidth = cols - treeWidth - 1; // -1 for divider
  const contentHeight = rows - 4; // Header + footer

  // Header
  moveTo(1, 1);
  const title = " AIDef Browser ";
  const stats = state.tree
    ? `${countNodes(state.tree)} nodes | ${countLeaves(state.tree)} leaves | ${countQuestions(state.tree)} questions`
    : "";
  write(
    color.inverse(title) +
      " " +
      stats +
      " ".repeat(Math.max(0, cols - title.length - stats.length - 1))
  );

  // Divider
  moveTo(2, 1);
  write(horizontalLine(cols));

  // Help overlay
  if (state.showHelp) {
    renderHelp(rows, cols);
    return;
  }

  // Tree pane
  renderTreePane(state, treeWidth, contentHeight);

  // Divider
  for (let row = 3; row < rows - 1; row++) {
    moveTo(row, treeWidth + 1);
    write(box.vertical);
  }

  // Content pane
  if (state.content && state.visibleNodes.length > 0) {
    const selectedNode = state.visibleNodes[state.selectedIndex];
    const contentLines = renderContentView(
      selectedNode,
      state.content,
      state.viewMode,
      state.scrollOffset,
      contentHeight,
      contentWidth
    );

    for (let i = 0; i < contentLines.length; i++) {
      moveTo(3 + i, treeWidth + 3);
      write(contentLines[i]);
    }
  }

  // Footer
  moveTo(rows - 1, 1);
  write(horizontalLine(cols));
  moveTo(rows, 1);

  const paneIndicator = state.activePane === "tree"
    ? color.inverse(" Tree ") + " Content"
    : " Tree " + color.inverse(" Content ");

  const footerLeft = `${paneIndicator} | 1:Spec 2:Context 3:Questions | b:Build r:Refresh ?:Help q:Quit`;
  const footerRight = state.statusMessage;

  write(footerLeft);
  moveTo(rows, cols - footerRight.length);
  write(footerRight);
}

/**
 * Render tree pane
 */
function renderTreePane(
  state: AppState,
  width: number,
  height: number
): void {
  const startRow = 3;

  // Calculate visible range (with scrolling if needed)
  const visibleCount = height;
  let startIndex = 0;

  if (state.selectedIndex >= visibleCount) {
    startIndex = state.selectedIndex - visibleCount + 1;
  }

  for (let i = 0; i < visibleCount; i++) {
    const nodeIndex = startIndex + i;
    moveTo(startRow + i, 1);

    if (nodeIndex < state.visibleNodes.length) {
      const node = state.visibleNodes[nodeIndex];
      const selected = nodeIndex === state.selectedIndex && state.activePane === "tree";
      let line = renderTreeNode(node, selected);

      // Truncate to fit
      if (line.length > width - 1) {
        line = line.slice(0, width - 4) + "...";
      }

      write(line);
    }
  }
}

/**
 * Render help overlay
 */
function renderHelp(rows: number, cols: number): void {
  const helpLines = [
    "",
    color.bold("  Keyboard Shortcuts"),
    "",
    "  Navigation:",
    "    ↑/k, ↓/j    Move selection",
    "    ←/h, →/l    Collapse/expand node",
    "    Enter       Toggle expand",
    "    Tab         Switch panes",
    "",
    "  Views:",
    "    1           Spec view",
    "    2           Context view",
    "    3           Questions view",
    "",
    "  Actions:",
    "    b           Build (generate code)",
    "    r           Refresh tree",
    "    ?           Toggle help",
    "    q, Ctrl+C   Quit",
    "",
    color.dim("  Press any key to close help"),
    "",
  ];

  const boxWidth = 50;
  const boxHeight = helpLines.length + 2;
  const startCol = Math.floor((cols - boxWidth) / 2);
  const startRow = Math.floor((rows - boxHeight) / 2);

  // Draw box
  moveTo(startRow, startCol);
  write(box.topLeft + horizontalLine(boxWidth - 2) + box.topRight);

  for (let i = 0; i < helpLines.length; i++) {
    moveTo(startRow + 1 + i, startCol);
    const line = helpLines[i];
    const padding = boxWidth - 2 - line.replace(/\x1b\[[0-9;]*m/g, "").length;
    write(box.vertical + line + " ".repeat(Math.max(0, padding)) + box.vertical);
  }

  moveTo(startRow + helpLines.length + 1, startCol);
  write(box.bottomLeft + horizontalLine(boxWidth - 2) + box.bottomRight);
}
