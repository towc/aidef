/**
 * AIDef AST Parser
 *
 * Parses tokens from the lexer into an Abstract Syntax Tree.
 * Uses nginx-like syntax with brace-first block detection.
 * 
 * Syntax:
 * - `name { ... }` - Module block
 * - `"question?" { ... }` - Query filter block
 * - `include ./path;` - Import statement
 * - `param="value";` - Parameter
 * - Everything else is prose
 */

import type {
  Token,
  TokenType,
  SourceLocation,
  SourceRange,
  ASTNode,
  RootNode,
  ModuleNode,
  QueryFilterNode,
  ProseNode,
  IncludeNode,
  ParameterNode,
  ParseError,
} from "../types/index.js";

export interface ParseResult {
  ast: RootNode;
  errors: ParseError[];
}

/**
 * Parse tokens into an AST.
 *
 * @param tokens - The tokens from the lexer
 * @param filename - The filename for error reporting
 * @returns ParseResult containing the AST and any parse errors
 */
export function parse(tokens: Token[], filename: string): ParseResult {
  const parser = new Parser(tokens, filename);
  return parser.parse();
}

/**
 * Internal Parser class that maintains state during parsing.
 */
class Parser {
  private tokens: Token[];
  private filename: string;
  private pos: number = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[], filename: string) {
    this.tokens = tokens;
    this.filename = filename;
  }

  /**
   * Main parse method - produces a RootNode containing all children.
   */
  parse(): ParseResult {
    const startLocation = this.currentLocation();
    const children: ASTNode[] = [];

    while (!this.isAtEnd()) {
      const startPos = this.pos;
      const node = this.parseTopLevel();
      if (node) {
        children.push(node);
      }
      // Safety: if no progress was made, advance to prevent infinite loop
      if (this.pos === startPos && !this.isAtEnd()) {
        this.advance();
      }
    }

    const endLocation = this.currentLocation();

    const ast: RootNode = {
      type: "root",
      children,
      source: {
        start: startLocation,
        end: endLocation,
      },
    };

    return { ast, errors: this.errors };
  }

  /**
   * Parse a top-level element.
   * Uses brace-first detection to distinguish blocks from prose.
   */
  private parseTopLevel(): ASTNode | null {
    this.skipInsignificant();

    if (this.isAtEnd()) {
      return null;
    }

    // Check for include statement
    // Only treat as include if it looks like: include <path>;
    // Not: "include unit tests" or "include: foo, bar"
    if (this.check("include") && this.looksLikeIncludeStatement()) {
      return this.parseInclude();
    }

    // Check for query filter: "question?" { }
    if (this.check("string")) {
      const stringToken = this.peek();
      // Look ahead for brace
      if (this.lookAheadForBrace()) {
        return this.parseQueryFilter();
      }
      // Otherwise it's prose
    }

    // Check for module block: name { }
    if (this.check("identifier")) {
      // Look ahead for brace (possibly after parameters pattern)
      if (this.lookAheadForBrace()) {
        return this.parseModule();
      }
      // Otherwise it's prose
    }

    // Check for parameter: name="value"; or name=123;
    if (this.isParameterStart()) {
      return this.parseParameter();
    }

    // Everything else is prose
    return this.parseProse();
  }

  /**
   * Look ahead to see if there's a `{` coming up (indicating a block).
   * Skips whitespace, comments, newlines.
   */
  private lookAheadForBrace(): boolean {
    const savedPos = this.pos;
    
    // Skip current token (identifier or string)
    this.advance();
    
    // Skip whitespace/comments/newlines
    this.skipInsignificant();
    
    const foundBrace = this.check("brace_open");
    
    // Restore position
    this.pos = savedPos;
    
    return foundBrace;
  }

  /**
   * Check if current position looks like a parameter start: identifier =
   */
  private isParameterStart(): boolean {
    if (!this.check("identifier")) {
      return false;
    }
    
    const savedPos = this.pos;
    this.advance(); // skip identifier
    this.skipWhitespace();
    const isParam = this.check("equals");
    this.pos = savedPos;
    
    return isParam;
  }

  /**
   * Check if this looks like an actual include statement vs prose starting with "include".
   * 
   * Valid include: `include ./path;` or `include name;` or `include ../foo/bar;`
   * Invalid (prose): `include unit tests;` (multiple words after)
   *                  `include: foo, bar` (colon after)
   *                  `include in the bundle` (not a path)
   * 
   * Rules:
   * 1. After `include` + whitespace, should be a path-like token
   * 2. Path must start with `.` or `..` OR be a single identifier with no spaces after
   * 3. If it's an identifier, there should be NO more tokens after (just ; or newline)
   */
  private looksLikeIncludeStatement(): boolean {
    const savedPos = this.pos;
    
    this.advance(); // skip 'include'
    this.skipWhitespace();
    
    // Check what follows
    const nextToken = this.peek();
    
    // If immediately followed by colon, it's prose like "include: foo"
    if (nextToken.type === "text" && nextToken.value.startsWith(":")) {
      this.pos = savedPos;
      return false;
    }
    
    // If next token is not identifier or text starting with '.', it's not an include
    if (nextToken.type !== "identifier" && nextToken.type !== "text") {
      this.pos = savedPos;
      return false;
    }
    
    const firstValue = nextToken.value;
    const startsWithDot = firstValue.startsWith(".");
    
    // Collect all non-whitespace tokens until terminator
    let tokenCount = 0;
    
    while (!this.isAtEnd() && !this.check("semicolon") && !this.check("newline") && !this.check("brace_open") && !this.check("brace_close")) {
      const token = this.peek();
      
      // Skip comments
      if (token.type === "comment") {
        this.advance();
        continue;
      }
      
      // At whitespace, check what follows
      if (token.type === "whitespace") {
        this.advance();
        this.skipWhitespace();
        
        // If there's more content after whitespace, it's not an include
        // (paths don't have spaces)
        if (!this.isAtEnd() && !this.check("semicolon") && !this.check("newline") && !this.check("brace_open") && !this.check("brace_close") && !this.check("comment")) {
          this.pos = savedPos;
          return false;
        }
        break;
      }
      
      tokenCount++;
      this.advance();
    }
    
    this.pos = savedPos;
    
    // Valid include patterns:
    // 1. Starts with . or .. (relative path) - can have multiple tokens like ./foo/bar
    // 2. Single identifier (bare name import) - exactly 1 token
    if (startsWithDot) {
      return tokenCount >= 1;
    } else {
      // Bare name: must be exactly 1 token (e.g., "include utils" not "include unit tests")
      return tokenCount === 1;
    }
  }

  /**
   * Parse an include statement: include ./path;
   */
  private parseInclude(): IncludeNode {
    const startLocation = this.currentLocation();
    
    this.advance(); // consume 'include'
    this.skipWhitespace();
    
    // Collect the path (everything until ; or newline)
    const pathParts: string[] = [];
    while (!this.isAtEnd() && !this.check("semicolon") && !this.check("newline") && !this.check("brace_open") && !this.check("brace_close")) {
      const token = this.peek();
      if (token.type === "whitespace") {
        // Stop at whitespace unless it's part of the path
        break;
      }
      if (token.type === "comment") {
        this.advance();
        continue;
      }
      pathParts.push(token.value);
      this.advance();
    }
    
    const path = pathParts.join("").trim();
    
    // Consume optional semicolon
    if (this.check("semicolon")) {
      this.advance();
    }
    
    if (!path) {
      this.addError("Expected path after 'include'", {
        start: startLocation,
        end: this.currentLocation(),
      });
    }
    
    return {
      type: "include",
      path,
      source: {
        start: startLocation,
        end: this.previousLocation(),
      },
    };
  }

  /**
   * Parse a query filter block: "question?" { ... }
   */
  private parseQueryFilter(): QueryFilterNode {
    const startLocation = this.currentLocation();
    
    // Get the question string
    const stringToken = this.advance();
    const question = this.extractStringContent(stringToken.value);
    
    this.skipInsignificant();
    
    // Expect opening brace
    if (!this.check("brace_open")) {
      this.addError("Expected '{' after query filter question", {
        start: this.currentLocation(),
        end: this.currentLocation(),
      });
      return {
        type: "query_filter",
        question,
        children: [],
        source: {
          start: startLocation,
          end: this.currentLocation(),
        },
      };
    }
    
    this.advance(); // consume '{'
    
    // Parse block content
    const children = this.parseBlockContent();
    
    // Expect closing brace
    this.skipInsignificant();
    if (this.check("brace_close")) {
      this.advance();
    } else {
      this.addError("Expected '}'", {
        start: this.currentLocation(),
        end: this.currentLocation(),
      });
    }
    
    return {
      type: "query_filter",
      question,
      children,
      source: {
        start: startLocation,
        end: this.previousLocation(),
      },
    };
  }

  /**
   * Parse a module block: name { ... }
   */
  private parseModule(): ModuleNode {
    const startLocation = this.currentLocation();
    
    // Get the module name
    const nameToken = this.advance();
    const name = nameToken.value;
    
    this.skipInsignificant();
    
    // Expect opening brace
    if (!this.check("brace_open")) {
      this.addError("Expected '{' after module name", {
        start: this.currentLocation(),
        end: this.currentLocation(),
      });
      return {
        type: "module",
        name,
        parameters: [],
        children: [],
        source: {
          start: startLocation,
          end: this.currentLocation(),
        },
      };
    }
    
    this.advance(); // consume '{'
    
    // Parse block content
    const children = this.parseBlockContent();
    
    // Extract parameters from children
    const parameters: ParameterNode[] = [];
    const nonParamChildren: ASTNode[] = [];
    
    for (const child of children) {
      if (child.type === "parameter") {
        parameters.push(child);
      } else {
        nonParamChildren.push(child);
      }
    }
    
    // Expect closing brace
    this.skipInsignificant();
    if (this.check("brace_close")) {
      this.advance();
    } else {
      this.addError("Expected '}'", {
        start: this.currentLocation(),
        end: this.currentLocation(),
      });
    }
    
    return {
      type: "module",
      name,
      parameters,
      children: nonParamChildren,
      source: {
        start: startLocation,
        end: this.previousLocation(),
      },
    };
  }

  /**
   * Parse content inside a block (between { and }).
   */
  private parseBlockContent(): ASTNode[] {
    const children: ASTNode[] = [];

    while (!this.isAtEnd()) {
      this.skipInsignificant();

      if (this.check("brace_close")) {
        break;
      }

      if (this.isAtEnd()) {
        break;
      }

      const startPos = this.pos;
      const node = this.parseBlockElement();
      if (node) {
        children.push(node);
      }
      // Safety: if no progress was made, advance to prevent infinite loop
      if (this.pos === startPos && !this.isAtEnd() && !this.check("brace_close")) {
        this.advance();
      }
    }

    return children;
  }

  /**
   * Parse a single element inside a block.
   */
  private parseBlockElement(): ASTNode | null {
    this.skipInsignificant();

    if (this.isAtEnd() || this.check("brace_close")) {
      return null;
    }

    // Include statement
    if (this.check("include") && this.looksLikeIncludeStatement()) {
      return this.parseInclude();
    }

    // Query filter: "question?" { }
    if (this.check("string") && this.lookAheadForBrace()) {
      return this.parseQueryFilter();
    }

    // Nested module: name { }
    if (this.check("identifier") && this.lookAheadForBrace()) {
      return this.parseModule();
    }

    // Parameter: name="value"; or name=123;
    if (this.isParameterStart()) {
      return this.parseParameter();
    }

    // Prose
    return this.parseProse();
  }

  /**
   * Parse a parameter: name="value"; or name=123;
   */
  private parseParameter(): ParameterNode {
    const startLocation = this.currentLocation();
    
    // Get parameter name
    const nameToken = this.advance();
    const name = nameToken.value;
    
    this.skipWhitespace();
    
    // Expect =
    if (!this.check("equals")) {
      this.addError("Expected '=' in parameter", {
        start: this.currentLocation(),
        end: this.currentLocation(),
      });
      return {
        type: "parameter",
        name,
        value: "",
        source: {
          start: startLocation,
          end: this.currentLocation(),
        },
      };
    }
    
    this.advance(); // consume '='
    this.skipWhitespace();
    
    // Get value (string or number)
    let value: string | number = "";
    
    if (this.check("string")) {
      const stringToken = this.advance();
      value = this.extractStringContent(stringToken.value);
    } else if (this.check("number")) {
      const numberToken = this.advance();
      value = parseFloat(numberToken.value);
    } else if (this.check("identifier")) {
      // Allow bare identifiers as values
      const identToken = this.advance();
      value = identToken.value;
    } else {
      this.addError("Expected string or number value for parameter", {
        start: this.currentLocation(),
        end: this.currentLocation(),
      });
    }
    
    // Consume optional semicolon
    this.skipWhitespace();
    if (this.check("semicolon")) {
      this.advance();
    }
    
    return {
      type: "parameter",
      name,
      value,
      source: {
        start: startLocation,
        end: this.previousLocation(),
      },
    };
  }

  /**
   * Parse prose content.
   */
  private parseProse(): ProseNode | null {
    const startLocation = this.currentLocation();
    const parts: string[] = [];

    while (!this.isAtEnd()) {
      const token = this.peek();

      // Stop at block boundaries
      if (token.type === "brace_open" || token.type === "brace_close") {
        break;
      }

      // Skip comments
      if (token.type === "comment") {
        this.advance();
        continue;
      }

      // Stop at include keyword only if it's at the start of a new statement
      // (i.e., we haven't collected any content yet) AND it looks like an include
      if (token.type === "include" && parts.length === 0 && this.looksLikeIncludeStatement()) {
        break;
      }

      // Check for query filter start
      if (token.type === "string" && this.lookAheadForBrace()) {
        break;
      }

      // Check for module start
      if (token.type === "identifier" && this.lookAheadForBrace()) {
        break;
      }

      // Check for parameter start
      if (this.isParameterStart()) {
        break;
      }

      // Semicolon ends current prose statement
      if (token.type === "semicolon") {
        this.advance();
        break;
      }

      // Collect token value
      if (
        token.type === "text" ||
        token.type === "identifier" ||
        token.type === "string" ||
        token.type === "number" ||
        token.type === "whitespace" ||
        token.type === "newline" ||
        token.type === "code_block" ||
        token.type === "inline_code" ||
        token.type === "equals" ||  // standalone = becomes prose
        token.type === "include"    // include not followed by path becomes prose
      ) {
        parts.push(token.value);
      }

      this.advance();
    }

    // Trim and clean up the content
    const content = parts.join("").trim();

    if (content.length === 0) {
      return null;
    }

    return {
      type: "prose",
      content,
      source: {
        start: startLocation,
        end: this.previousLocation(),
      },
    };
  }

  /**
   * Extract content from a string token (remove quotes and handle escapes).
   */
  private extractStringContent(str: string): string {
    // Remove surrounding quotes
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }
    // Handle escape sequences
    return str.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Check if we've reached the end of tokens.
   */
  private isAtEnd(): boolean {
    return (
      this.pos >= this.tokens.length || this.tokens[this.pos].type === "eof"
    );
  }

  /**
   * Peek at the current token without consuming it.
   */
  private peek(): Token {
    if (this.pos >= this.tokens.length) {
      // Return a synthetic EOF token
      const lastToken = this.tokens[this.tokens.length - 1];
      return {
        type: "eof",
        value: "",
        location: lastToken?.location || {
          file: this.filename,
          line: 1,
          column: 1,
          offset: 0,
        },
      };
    }
    return this.tokens[this.pos];
  }

  /**
   * Check if current token is of a specific type.
   */
  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  /**
   * Advance to the next token and return the current one.
   */
  private advance(): Token {
    const token = this.peek();
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return token;
  }

  /**
   * Skip whitespace tokens only.
   */
  private skipWhitespace(): void {
    while (this.check("whitespace")) {
      this.advance();
    }
  }

  /**
   * Skip whitespace, newlines, and comments.
   */
  private skipInsignificant(): void {
    while (
      this.check("whitespace") ||
      this.check("newline") ||
      this.check("comment")
    ) {
      this.advance();
    }
  }

  /**
   * Get the current source location.
   */
  private currentLocation(): SourceLocation {
    return this.peek().location;
  }

  /**
   * Get the previous token's end location.
   */
  private previousLocation(): SourceLocation {
    if (this.pos > 0) {
      const prevToken = this.tokens[this.pos - 1];
      return {
        file: prevToken.location.file,
        line: prevToken.location.line,
        column: prevToken.location.column + prevToken.value.length,
        offset: prevToken.location.offset + prevToken.value.length,
      };
    }
    return this.currentLocation();
  }

  /**
   * Add a parse error.
   */
  private addError(message: string, location: SourceRange): void {
    this.errors.push({
      message,
      location,
      severity: "error",
    });
  }
}
