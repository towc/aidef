/**
 * AIDef Lexer
 *
 * Tokenizes .aid files into a stream of tokens for the parser.
 * Supports CSS-like syntax with imports, code blocks, and prose content.
 */

import type {
  Token,
  TokenType,
  LexerResult,
  LexerError,
  SourceLocation,
} from "../types/index.js";

/**
 * Tokenize an AID source file into tokens.
 *
 * @param source - The source code to tokenize
 * @param filename - The filename for error reporting
 * @returns LexerResult containing tokens and any lexer errors
 */
export function tokenize(source: string, filename: string): LexerResult {
  const lexer = new Lexer(source, filename);
  return lexer.tokenize();
}

/**
 * Internal Lexer class that maintains state during tokenization.
 */
class Lexer {
  private source: string;
  private filename: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private errors: LexerError[] = [];

  constructor(source: string, filename: string) {
    this.source = source;
    this.filename = filename;
  }

  /**
   * Main tokenization loop.
   */
  tokenize(): LexerResult {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    // Add EOF token
    this.addToken("eof", "");

    return {
      tokens: this.tokens,
      errors: this.errors,
    };
  }

  /**
   * Scan a single token from the current position.
   */
  private scanToken(): void {
    const c = this.peek();

    // Newline
    if (c === "\n") {
      this.addToken("newline", this.advance());
      return;
    }

    // Whitespace (spaces, tabs, carriage returns)
    if (c === " " || c === "\t" || c === "\r") {
      this.scanWhitespace();
      return;
    }

    // Comments
    if (c === "/") {
      if (this.peekNext() === "/") {
        this.scanLineComment();
        return;
      }
      if (this.peekNext() === "*") {
        this.scanBlockComment();
        return;
      }
    }

    // Fenced code blocks (```)
    if (c === "`" && this.peekNext() === "`" && this.peekAt(2) === "`") {
      this.scanFencedCodeBlock();
      return;
    }

    // Inline code blocks (`)
    if (c === "`") {
      this.scanInlineCode();
      return;
    }

    // Import (@path)
    if (c === "@") {
      this.scanImport();
      return;
    }

    // Important (!important)
    if (c === "!") {
      if (this.matchAhead("!important")) {
        this.scanImportant();
        return;
      }
      // Unknown ! - treat as prose start
      this.scanProse();
      return;
    }

    // Single-character tokens
    if (c === "{") {
      this.addToken("brace_open", this.advance());
      return;
    }
    if (c === "}") {
      this.addToken("brace_close", this.advance());
      return;
    }
    if (c === "(") {
      this.addToken("paren_open", this.advance());
      return;
    }
    if (c === ")") {
      this.addToken("paren_close", this.advance());
      return;
    }
    if (c === ".") {
      this.addToken("dot", this.advance());
      return;
    }
    if (c === ":") {
      this.addToken("colon", this.advance());
      return;
    }
    if (c === "*") {
      this.addToken("star", this.advance());
      return;
    }
    if (c === "+") {
      this.addToken("plus", this.advance());
      return;
    }
    if (c === "~") {
      this.addToken("tilde", this.advance());
      return;
    }
    if (c === ">") {
      this.addToken("gt", this.advance());
      return;
    }

    // Identifiers
    if (this.isIdentifierStart(c)) {
      this.scanIdentifier();
      return;
    }

    // Everything else is prose
    this.scanProse();
  }

  /**
   * Scan whitespace (spaces and tabs only, not newlines).
   */
  private scanWhitespace(): void {
    const start = this.pos;
    while (!this.isAtEnd()) {
      const c = this.peek();
      if (c === " " || c === "\t" || c === "\r") {
        this.advance();
      } else {
        break;
      }
    }
    this.addTokenAt("whitespace", this.source.slice(start, this.pos), start);
  }

  /**
   * Scan a line comment (// ...).
   */
  private scanLineComment(): void {
    const start = this.pos;
    // Consume //
    this.advance();
    this.advance();

    // Consume until newline or end
    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }

    this.addTokenAt("comment", this.source.slice(start, this.pos), start);
  }

  /**
   * Scan a block comment (/* ... *\/).
   */
  private scanBlockComment(): void {
    const start = this.pos;
    const startLine = this.line;
    const startColumn = this.column;

    // Consume /*
    this.advance();
    this.advance();

    // Consume until */ or end
    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance();
        this.advance();
        this.addTokenAt("comment", this.source.slice(start, this.pos), start);
        return;
      }
      this.advance();
    }

    // Unclosed comment - add error but still create token
    this.addError("Unclosed block comment", {
      file: this.filename,
      line: startLine,
      column: startColumn,
      offset: start,
    });
    this.addTokenAt("comment", this.source.slice(start, this.pos), start);
  }

  /**
   * Scan a fenced code block (```...```).
   */
  private scanFencedCodeBlock(): void {
    const start = this.pos;
    const startLine = this.line;
    const startColumn = this.column;

    // Consume opening ```
    this.advance();
    this.advance();
    this.advance();

    // Consume until closing ``` or end
    while (!this.isAtEnd()) {
      if (
        this.peek() === "`" &&
        this.peekNext() === "`" &&
        this.peekAt(2) === "`"
      ) {
        this.advance();
        this.advance();
        this.advance();
        this.addTokenAt("code_block", this.source.slice(start, this.pos), start);
        return;
      }
      this.advance();
    }

    // Unclosed code block - add error but still create token
    this.addError("Unclosed fenced code block", {
      file: this.filename,
      line: startLine,
      column: startColumn,
      offset: start,
    });
    this.addTokenAt("code_block", this.source.slice(start, this.pos), start);
  }

  /**
   * Scan an inline code block (`...`).
   */
  private scanInlineCode(): void {
    const start = this.pos;
    const startLine = this.line;
    const startColumn = this.column;

    // Consume opening `
    this.advance();

    // Consume until closing ` or newline or end
    while (!this.isAtEnd() && this.peek() !== "`" && this.peek() !== "\n") {
      this.advance();
    }

    if (this.peek() === "`") {
      this.advance();
      this.addTokenAt("inline_code", this.source.slice(start, this.pos), start);
    } else {
      // Unclosed inline code - add error but still create token
      this.addError("Unclosed inline code", {
        file: this.filename,
        line: startLine,
        column: startColumn,
        offset: start,
      });
      this.addTokenAt("inline_code", this.source.slice(start, this.pos), start);
    }
  }

  /**
   * Scan an import token (@path).
   */
  private scanImport(): void {
    const start = this.pos;

    // Consume @
    this.advance();

    // Consume the path (until whitespace or structural character)
    while (!this.isAtEnd()) {
      const c = this.peek();
      // Stop at whitespace, newlines, braces, parens, or other structural chars
      if (
        c === " " ||
        c === "\t" ||
        c === "\r" ||
        c === "\n" ||
        c === "{" ||
        c === "}" ||
        c === "(" ||
        c === ")"
      ) {
        break;
      }
      this.advance();
    }

    this.addTokenAt("import", this.source.slice(start, this.pos), start);
  }

  /**
   * Scan !important token.
   */
  private scanImportant(): void {
    const start = this.pos;
    // Consume "!important" (10 characters)
    for (let i = 0; i < 10; i++) {
      this.advance();
    }
    this.addTokenAt("important", "!important", start);
  }

  /**
   * Scan an identifier.
   */
  private scanIdentifier(): void {
    const start = this.pos;

    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      this.advance();
    }

    this.addTokenAt("identifier", this.source.slice(start, this.pos), start);
  }

  /**
   * Scan prose content (plain text between structural elements).
   * Prose is text that cannot be parsed as other token types.
   */
  private scanProse(): void {
    const start = this.pos;

    while (!this.isAtEnd()) {
      const c = this.peek();

      // Stop at whitespace (handled by main scanner)
      if (c === " " || c === "\t" || c === "\r") {
        break;
      }

      // Stop at structural characters
      if (
        c === "{" ||
        c === "}" ||
        c === "(" ||
        c === ")" ||
        c === "\n" ||
        c === "." ||
        c === ":" ||
        c === "*" ||
        c === "+" ||
        c === "~" ||
        c === ">" ||
        c === "@" ||
        c === "`"
      ) {
        break;
      }

      // Stop at identifier start (so identifiers get properly tokenized)
      if (this.isIdentifierStart(c)) {
        break;
      }

      // Check for !important
      if (c === "!" && this.matchAhead("!important")) {
        break;
      }

      // Check for comments
      if (c === "/" && (this.peekNext() === "/" || this.peekNext() === "*")) {
        break;
      }

      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    if (value.length > 0) {
      this.addTokenAt("prose", value, start);
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Check if we've reached the end of the source.
   */
  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  /**
   * Peek at the current character without consuming it.
   */
  private peek(): string {
    if (this.isAtEnd()) return "\0";
    return this.source[this.pos];
  }

  /**
   * Peek at the next character without consuming it.
   */
  private peekNext(): string {
    if (this.pos + 1 >= this.source.length) return "\0";
    return this.source[this.pos + 1];
  }

  /**
   * Peek at a character at a specific offset from current position.
   */
  private peekAt(offset: number): string {
    if (this.pos + offset >= this.source.length) return "\0";
    return this.source[this.pos + offset];
  }

  /**
   * Advance to the next character and return the current one.
   */
  private advance(): string {
    const c = this.source[this.pos];
    this.pos++;

    if (c === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }

    return c;
  }

  /**
   * Check if a character can start an identifier.
   */
  private isIdentifierStart(c: string): boolean {
    return (
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      c === "_"
    );
  }

  /**
   * Check if a character can be part of an identifier.
   */
  private isIdentifierChar(c: string): boolean {
    return (
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z") ||
      (c >= "0" && c <= "9") ||
      c === "_"
    );
  }

  /**
   * Check if the source ahead matches a given string.
   */
  private matchAhead(expected: string): boolean {
    for (let i = 0; i < expected.length; i++) {
      if (this.pos + i >= this.source.length) return false;
      if (this.source[this.pos + i] !== expected[i]) return false;
    }
    return true;
  }

  /**
   * Add a token at the current position.
   */
  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      location: this.makeLocation(this.pos - value.length),
    });
  }

  /**
   * Add a token at a specific starting position.
   */
  private addTokenAt(type: TokenType, value: string, start: number): void {
    this.tokens.push({
      type,
      value,
      location: this.makeLocationAt(start),
    });
  }

  /**
   * Create a source location at a specific offset.
   */
  private makeLocationAt(offset: number): SourceLocation {
    // Calculate line and column for the given offset
    let line = 1;
    let column = 1;

    for (let i = 0; i < offset; i++) {
      if (this.source[i] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
    }

    return {
      file: this.filename,
      line,
      column,
      offset,
    };
  }

  /**
   * Create a source location from an offset.
   */
  private makeLocation(offset: number): SourceLocation {
    return this.makeLocationAt(offset);
  }

  /**
   * Add an error to the errors list.
   */
  private addError(message: string, location: SourceLocation): void {
    this.errors.push({ message, location });
  }
}
