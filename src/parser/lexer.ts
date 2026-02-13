/**
 * AIDef Lexer
 *
 * Tokenizes .aid files with nginx-like syntax.
 * 
 * Token types:
 * - identifier: module names, parameter names (no spaces)
 * - string: "..." for query filters and parameter values
 * - number: 123 for numeric parameter values
 * - brace_open/close: { }
 * - semicolon: ;
 * - equals: =
 * - include: the 'include' keyword
 * - comment: /* * / and //
 * - code_block: ```...```
 * - inline_code: `...`
 * - text: plain text (prose)
 * - newline: \n
 * - whitespace: spaces/tabs
 * - eof: end of file
 */

import type {
  Token,
  TokenType,
  SourceLocation,
  LexerResult,
  LexerError,
} from "../types/index.js";

/**
 * Tokenize an .aid file.
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
   * Main tokenize method.
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
   * Scan a single token.
   */
  private scanToken(): void {
    const char = this.peek();

    // Whitespace (not newline)
    if (char === " " || char === "\t" || char === "\r") {
      this.scanWhitespace();
      return;
    }

    // Newline
    if (char === "\n") {
      this.addToken("newline", "\n");
      this.advance();
      this.line++;
      this.column = 1;
      return;
    }

    // Block comment: /* ... */
    if (char === "/" && this.peekNext() === "*") {
      this.scanBlockComment();
      return;
    }

    // Line comment: // ...
    if (char === "/" && this.peekNext() === "/") {
      this.scanLineComment();
      return;
    }

    // Fenced code block: ```...```
    if (char === "`" && this.peekNext() === "`" && this.peek(2) === "`") {
      this.scanFencedCodeBlock();
      return;
    }

    // Inline code: `...`
    if (char === "`") {
      this.scanInlineCode();
      return;
    }

    // String: "..."
    if (char === '"') {
      this.scanString();
      return;
    }

    // Braces
    if (char === "{") {
      this.addToken("brace_open", "{");
      this.advance();
      return;
    }

    if (char === "}") {
      this.addToken("brace_close", "}");
      this.advance();
      return;
    }

    // Semicolon
    if (char === ";") {
      this.addToken("semicolon", ";");
      this.advance();
      return;
    }

    // Equals
    if (char === "=") {
      this.addToken("equals", "=");
      this.advance();
      return;
    }

    // Number (for parameters like priority=1)
    if (this.isDigit(char)) {
      this.scanNumber();
      return;
    }

    // Identifier or keyword
    if (this.isIdentifierStart(char)) {
      this.scanIdentifier();
      return;
    }

    // Everything else is text (prose)
    this.scanText();
  }

  /**
   * Scan whitespace (spaces and tabs, not newlines).
   */
  private scanWhitespace(): void {
    const start = this.pos;
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === " " || char === "\t" || char === "\r") {
        this.advance();
      } else {
        break;
      }
    }
    const value = this.source.slice(start, this.pos);
    this.addToken("whitespace", value);
  }

  /**
   * Scan a block comment: /* ... * /
   */
  private scanBlockComment(): void {
    const startLine = this.line;
    const startColumn = this.column;
    const start = this.pos;

    // Consume /*
    this.advance(); // /
    this.advance(); // *

    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance(); // *
        this.advance(); // /
        break;
      }
      if (this.peek() === "\n") {
        this.line++;
        this.column = 0; // Will be incremented by advance()
      }
      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    this.tokens.push({
      type: "comment",
      value,
      location: {
        file: this.filename,
        line: startLine,
        column: startColumn,
        offset: start,
      },
    });

    // Check if comment was closed
    if (!value.endsWith("*/")) {
      this.addError("Unclosed block comment", start);
    }
  }

  /**
   * Scan a line comment: // ...
   */
  private scanLineComment(): void {
    const start = this.pos;

    // Consume until end of line
    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    this.addToken("comment", value);
  }

  /**
   * Scan a fenced code block: ```...```
   */
  private scanFencedCodeBlock(): void {
    const startLine = this.line;
    const startColumn = this.column;
    const start = this.pos;

    // Consume opening ```
    this.advance(); // `
    this.advance(); // `
    this.advance(); // `

    // Consume optional language identifier on same line
    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }

    // Consume content until closing ```
    while (!this.isAtEnd()) {
      if (this.peek() === "\n") {
        this.line++;
        this.column = 0;
      }

      // Check for closing ``` at start of line
      if (
        this.peek() === "`" &&
        this.peekNext() === "`" &&
        this.peek(2) === "`"
      ) {
        this.advance(); // `
        this.advance(); // `
        this.advance(); // `
        break;
      }

      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    this.tokens.push({
      type: "code_block",
      value,
      location: {
        file: this.filename,
        line: startLine,
        column: startColumn,
        offset: start,
      },
    });

    // Check if code block was closed
    if (!value.endsWith("```")) {
      this.addError("Unclosed fenced code block", start);
    }
  }

  /**
   * Scan inline code: `...`
   */
  private scanInlineCode(): void {
    const start = this.pos;

    // Consume opening `
    this.advance();

    // Consume until closing ` or newline
    while (!this.isAtEnd() && this.peek() !== "`" && this.peek() !== "\n") {
      this.advance();
    }

    if (this.peek() === "`") {
      this.advance(); // closing `
    } else {
      this.addError("Unclosed inline code", start);
    }

    const value = this.source.slice(start, this.pos);
    this.addToken("inline_code", value);
  }

  /**
   * Scan a string: "..."
   */
  private scanString(): void {
    const startLine = this.line;
    const startColumn = this.column;
    const start = this.pos;

    // Consume opening "
    this.advance();

    // Consume until closing " (handle escapes)
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === "\\") {
        this.advance(); // backslash
        if (!this.isAtEnd()) {
          this.advance(); // escaped char
        }
      } else if (this.peek() === "\n") {
        // Strings can span lines in our syntax
        this.line++;
        this.column = 0;
        this.advance();
      } else {
        this.advance();
      }
    }

    if (this.peek() === '"') {
      this.advance(); // closing "
    } else {
      this.addError("Unclosed string", start);
    }

    const value = this.source.slice(start, this.pos);
    this.tokens.push({
      type: "string",
      value,
      location: {
        file: this.filename,
        line: startLine,
        column: startColumn,
        offset: start,
      },
    });
  }

  /**
   * Scan a number.
   */
  private scanNumber(): void {
    const start = this.pos;

    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      this.advance();
    }

    // Handle decimal
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance(); // .
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const value = this.source.slice(start, this.pos);
    this.addToken("number", value);
  }

  /**
   * Scan an identifier or keyword.
   */
  private scanIdentifier(): void {
    const start = this.pos;

    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      this.advance();
    }

    const value = this.source.slice(start, this.pos);

    // Check for keywords
    if (value === "include") {
      this.addToken("include", value);
    } else {
      this.addToken("identifier", value);
    }
  }

  /**
   * Scan text (prose) - anything that's not a structural token.
   * Stops at: { } ; = " ` newline, or identifier/keyword boundary
   */
  private scanText(): void {
    const start = this.pos;

    while (!this.isAtEnd()) {
      const char = this.peek();

      // Stop at structural tokens
      if (
        char === "{" ||
        char === "}" ||
        char === ";" ||
        char === "=" ||
        char === '"' ||
        char === "`" ||
        char === "\n"
      ) {
        break;
      }

      // Stop at comment start
      if (char === "/" && (this.peekNext() === "*" || this.peekNext() === "/")) {
        break;
      }

      // Stop at whitespace to let it be tokenized separately
      // (so prose is broken into chunks for better source mapping)
      if (char === " " || char === "\t" || char === "\r") {
        break;
      }

      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    if (value.length > 0) {
      this.addToken("text", value);
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Check if we've reached the end of source.
   */
  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  /**
   * Peek at current character.
   */
  private peek(offset: number = 0): string {
    if (this.pos + offset >= this.source.length) {
      return "\0";
    }
    return this.source[this.pos + offset];
  }

  /**
   * Peek at next character.
   */
  private peekNext(): string {
    return this.peek(1);
  }

  /**
   * Peek at previous character.
   */
  private peekPrev(): string {
    if (this.pos <= 0) {
      return "\0";
    }
    return this.source[this.pos - 1];
  }

  /**
   * Advance to next character.
   */
  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  /**
   * Check if character is a digit.
   */
  private isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
  }

  /**
   * Check if character can start an identifier.
   */
  private isIdentifierStart(char: string): boolean {
    return (
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      char === "_"
    );
  }

  /**
   * Check if character can be part of an identifier.
   */
  private isIdentifierChar(char: string): boolean {
    return (
      this.isIdentifierStart(char) ||
      this.isDigit(char) ||
      char === "-" // allow hyphens in module names like 'email-service'
    );
  }

  /**
   * Add a token.
   */
  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      location: {
        file: this.filename,
        line: this.line,
        column: this.column - value.length,
        offset: this.pos - value.length,
      },
    });
  }

  /**
   * Add a lexer error.
   */
  private addError(message: string, offset: number): void {
    this.errors.push({
      message,
      location: {
        file: this.filename,
        line: this.line,
        column: this.column,
        offset,
      },
    });
  }
}
