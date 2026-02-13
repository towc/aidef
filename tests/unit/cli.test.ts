import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, findRootAid, ensureAidGenDir, printHelp } from "../../src/cli/index";

describe("CLI argument parsing", () => {
  test("defaults to 'run' command with no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("run");
    expect(result.verbose).toBe(false);
    expect(result.help).toBe(false);
  });

  test("parses --browse flag", () => {
    const result = parseArgs(["--browse"]);
    expect(result.command).toBe("browse");
  });

  test("parses --build flag", () => {
    const result = parseArgs(["--build"]);
    expect(result.command).toBe("build");
  });

  test("parses --auth flag", () => {
    const result = parseArgs(["--auth"]);
    expect(result.command).toBe("auth");
  });

  test("parses --estimate flag", () => {
    const result = parseArgs(["--estimate"]);
    expect(result.command).toBe("estimate");
  });

  test("parses --verbose flag", () => {
    const result = parseArgs(["--verbose"]);
    expect(result.verbose).toBe(true);
  });

  test("parses -v flag", () => {
    const result = parseArgs(["-v"]);
    expect(result.verbose).toBe(true);
  });

  test("parses --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.help).toBe(true);
  });

  test("parses -h flag", () => {
    const result = parseArgs(["-h"]);
    expect(result.help).toBe(true);
  });

  test("parses multiple flags", () => {
    const result = parseArgs(["--build", "--verbose"]);
    expect(result.command).toBe("build");
    expect(result.verbose).toBe(true);
  });

  test("last command flag wins", () => {
    const result = parseArgs(["--browse", "--build"]);
    expect(result.command).toBe("build");
  });
});

describe("findRootAid", () => {
  const testDir = "/tmp/aidef-test-cli";

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("returns null when root.aid does not exist", () => {
    const result = findRootAid(testDir);
    expect(result).toBeNull();
  });

  test("returns path when root.aid exists", () => {
    const rootAidPath = join(testDir, "root.aid");
    writeFileSync(rootAidPath, "server { }");
    
    const result = findRootAid(testDir);
    expect(result).toBe(rootAidPath);
  });
});

describe("ensureAidGenDir", () => {
  const testDir = "/tmp/aidef-test-cli-gen";

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  test("creates .aid-gen directory if it does not exist", () => {
    const aidGenPath = join(testDir, ".aid-gen");
    expect(existsSync(aidGenPath)).toBe(false);
    
    ensureAidGenDir(testDir);
    
    expect(existsSync(aidGenPath)).toBe(true);
  });

  test("does not error if .aid-gen already exists", () => {
    const aidGenPath = join(testDir, ".aid-gen");
    mkdirSync(aidGenPath);
    
    expect(() => ensureAidGenDir(testDir)).not.toThrow();
    expect(existsSync(aidGenPath)).toBe(true);
  });
});

describe("help output", () => {
  test("printHelp does not throw", () => {
    // Capture console.log output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    try {
      printHelp();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toContain("AIDef");
      expect(logs[0]).toContain("Usage:");
    } finally {
      console.log = originalLog;
    }
  });
});
