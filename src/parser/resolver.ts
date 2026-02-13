/**
 * AIDef Import Resolver
 *
 * Resolves `include` statements in .aid files by:
 * 1. Parsing referenced .aid files recursively
 * 2. Inlining non-.aid files as prose content
 * 3. Detecting circular imports
 * 4. Merging imported ASTs into the parent AST
 */

import { resolve as resolvePath, dirname, isAbsolute } from "node:path";
import type {
  RootNode,
  ASTNode,
  IncludeNode,
  ProseNode,
  ModuleNode,
  QueryFilterNode,
  ResolvedImport,
  ResolvedSpec,
  ParseError,
  SourceRange,
} from "../types/index.js";
import { tokenize } from "./lexer.js";
import { parse } from "./ast.js";

/**
 * Resolve all imports in an AST.
 *
 * @param ast - The root AST to resolve imports in
 * @param basePath - Directory containing the root file
 * @returns ResolvedSpec with resolved AST, import map, and errors
 */
export async function resolve(
  ast: RootNode,
  basePath: string
): Promise<ResolvedSpec> {
  const resolver = new ImportResolver(basePath);
  return resolver.resolve(ast);
}

/**
 * Convenience function to parse a file and resolve all its imports.
 *
 * @param filePath - Path to the .aid file to parse
 * @returns ResolvedSpec with fully resolved AST
 */
export async function parseAndResolve(filePath: string): Promise<ResolvedSpec> {
  const absolutePath = isAbsolute(filePath)
    ? filePath
    : resolvePath(process.cwd(), filePath);

  const errors: ParseError[] = [];

  // Read the file
  let content: string;
  try {
    const file = Bun.file(absolutePath);
    content = await file.text();
  } catch (err) {
    const error: ParseError = {
      message: `Failed to read file: ${absolutePath}`,
      location: makeEmptyRange(absolutePath),
      severity: "error",
    };
    return {
      ast: makeEmptyRoot(absolutePath),
      imports: new Map(),
      errors: [error],
    };
  }

  // Tokenize
  const { tokens, errors: lexerErrors } = tokenize(content, absolutePath);
  for (const lexErr of lexerErrors) {
    errors.push({
      message: lexErr.message,
      location: {
        start: lexErr.location,
        end: lexErr.location,
      },
      severity: "error",
    });
  }

  // Parse
  const { ast, errors: parseErrors } = parse(tokens, absolutePath);
  errors.push(...parseErrors);

  // Resolve imports
  const basePath = dirname(absolutePath);
  const resolver = new ImportResolver(basePath);
  const resolved = await resolver.resolve(ast);

  // Merge errors
  resolved.errors = [...errors, ...resolved.errors];

  return resolved;
}

/**
 * Internal resolver class that tracks state during resolution.
 */
class ImportResolver {
  private basePath: string;
  private imports: Map<string, ResolvedImport> = new Map();
  private errors: ParseError[] = [];
  private resolving: Set<string> = new Set(); // For circular import detection

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Resolve all imports in the AST.
   */
  async resolve(ast: RootNode): Promise<ResolvedSpec> {
    const resolvedChildren = await this.resolveChildren(
      ast.children,
      this.basePath
    );

    const resolvedAst: RootNode = {
      type: "root",
      children: resolvedChildren,
      source: ast.source,
    };

    return {
      ast: resolvedAst,
      imports: this.imports,
      errors: this.errors,
    };
  }

  /**
   * Resolve imports in a list of children nodes.
   */
  private async resolveChildren(
    children: ASTNode[],
    currentBasePath: string
  ): Promise<ASTNode[]> {
    const result: ASTNode[] = [];

    for (const child of children) {
      if (child.type === "include") {
        const resolved = await this.resolveInclude(child, currentBasePath);
        result.push(...resolved);
      } else if (this.hasChildren(child)) {
        // Recursively resolve imports in nested blocks
        const resolvedNode = await this.resolveNode(child, currentBasePath);
        result.push(resolvedNode);
      } else {
        result.push(child);
      }
    }

    return result;
  }

  /**
   * Check if a node has children that may contain imports.
   */
  private hasChildren(
    node: ASTNode
  ): node is ModuleNode | QueryFilterNode {
    return node.type === "module" || node.type === "query_filter";
  }

  /**
   * Resolve imports within a node that has children.
   */
  private async resolveNode(
    node: ModuleNode | QueryFilterNode,
    currentBasePath: string
  ): Promise<ASTNode> {
    const resolvedChildren = await this.resolveChildren(
      node.children,
      currentBasePath
    );

    // Return a new node with resolved children
    return {
      ...node,
      children: resolvedChildren,
    };
  }

  /**
   * Resolve a single include statement.
   */
  private async resolveInclude(
    includeNode: IncludeNode,
    currentBasePath: string
  ): Promise<ASTNode[]> {
    const includePath = includeNode.path;

    // Handle URL imports (detect even partial URLs corrupted by lexer treating :// as comment)
    // Common patterns: "https:", "http:", "ftp:", or anything with "://"
    if (
      includePath.startsWith("http:") ||
      includePath.startsWith("https:") ||
      includePath.startsWith("ftp:") ||
      includePath.includes("://")
    ) {
      this.errors.push({
        message: "URL imports not yet supported",
        location: includeNode.source,
        severity: "error",
      });
      return [];
    }

    // Resolve the path
    const resolvedPath = this.resolvePath(includePath, currentBasePath);

    // Check for circular imports
    if (this.resolving.has(resolvedPath)) {
      this.errors.push({
        message: `Circular import detected: ${resolvedPath}`,
        location: includeNode.source,
        severity: "error",
      });
      return [];
    }

    // Check if already resolved (reuse)
    if (this.imports.has(resolvedPath)) {
      const existing = this.imports.get(resolvedPath)!;
      if (existing.isAidFile && existing.ast) {
        return [...existing.ast.children];
      } else if (!existing.isAidFile && existing.content !== undefined) {
        return [this.makeProseNode(existing.content, includeNode.source)];
      }
      return [];
    }

    // Mark as being resolved
    this.resolving.add(resolvedPath);

    try {
      // Read the file
      let content: string;
      try {
        const file = Bun.file(resolvedPath);
        content = await file.text();
      } catch (err) {
        this.errors.push({
          message: `Failed to read import: ${resolvedPath}`,
          location: includeNode.source,
          severity: "error",
        });
        this.resolving.delete(resolvedPath);
        return [];
      }

      const isAidFile = resolvedPath.endsWith(".aid");

      if (isAidFile) {
        // Parse the .aid file
        const { tokens, errors: lexerErrors } = tokenize(content, resolvedPath);
        for (const lexErr of lexerErrors) {
          this.errors.push({
            message: lexErr.message,
            location: {
              start: lexErr.location,
              end: lexErr.location,
            },
            severity: "error",
          });
        }

        const { ast, errors: parseErrors } = parse(tokens, resolvedPath);
        this.errors.push(...parseErrors);

        // Recursively resolve imports in the parsed AST
        const importBasePath = dirname(resolvedPath);
        const resolvedChildren = await this.resolveChildren(
          ast.children,
          importBasePath
        );

        const resolvedAst: RootNode = {
          type: "root",
          children: resolvedChildren,
          source: ast.source,
        };

        // Store the resolved import
        const resolvedImport: ResolvedImport = {
          originalPath: includePath,
          resolvedPath,
          isAidFile: true,
          ast: resolvedAst,
        };
        this.imports.set(resolvedPath, resolvedImport);

        this.resolving.delete(resolvedPath);
        return [...resolvedChildren];
      } else {
        // Non-.aid file: inline as prose
        const resolvedImport: ResolvedImport = {
          originalPath: includePath,
          resolvedPath,
          isAidFile: false,
          content,
        };
        this.imports.set(resolvedPath, resolvedImport);

        this.resolving.delete(resolvedPath);
        return [this.makeProseNode(content, includeNode.source)];
      }
    } catch (err) {
      this.resolving.delete(resolvedPath);
      this.errors.push({
        message: `Error resolving import: ${err}`,
        location: includeNode.source,
        severity: "error",
      });
      return [];
    }
  }

  /**
   * Resolve an import path to an absolute path.
   *
   * Import formats:
   * 1. `name` → `./name.aid` (bare name)
   * 2. `./path` → `./path.aid` (relative, adds .aid if no extension)
   * 3. `./path.aid` → `./path.aid` (explicit .aid extension)
   * 4. `./path.md` → `./path.md` (non-.aid file)
   */
  private resolvePath(importPath: string, basePath: string): string {
    let normalizedPath = importPath;

    // If it's a bare name (no ./ or ../ prefix), treat as local
    if (!importPath.startsWith("./") && !importPath.startsWith("../")) {
      normalizedPath = "./" + importPath;
    }

    // Check if it has an extension
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(normalizedPath);

    // Add .aid extension if no extension present
    if (!hasExtension) {
      normalizedPath += ".aid";
    }

    // Resolve to absolute path
    return resolvePath(basePath, normalizedPath);
  }

  /**
   * Create a prose node from file content.
   */
  private makeProseNode(content: string, source: SourceRange): ProseNode {
    return {
      type: "prose",
      content: content.trim(),
      source,
    };
  }
}

/**
 * Create an empty source range for error reporting.
 */
function makeEmptyRange(file: string): SourceRange {
  return {
    start: { file, line: 1, column: 1, offset: 0 },
    end: { file, line: 1, column: 1, offset: 0 },
  };
}

/**
 * Create an empty root node.
 */
function makeEmptyRoot(file: string): RootNode {
  return {
    type: "root",
    children: [],
    source: makeEmptyRange(file),
  };
}
