/**
 * AIDef AST Parser
 *
 * Parses tokens from the lexer into an Abstract Syntax Tree.
 * Handles CSS-like selector syntax with combinators, pseudo-selectors,
 * tags, modules, and prose content.
 */

import type {
  Token,
  TokenType,
  SourceLocation,
  SourceRange,
  ASTNode,
  RootNode,
  ModuleNode,
  TagBlockNode,
  UniversalBlockNode,
  PseudoBlockNode,
  ProseNode,
  ImportNode,
  ParseError,
  PseudoSelector,
  Combinator,
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
   * Parse a top-level element (selector block, import, prose, etc.)
   */
  private parseTopLevel(): ASTNode | null {
    this.skipWhitespaceAndNewlines();
    this.skipComments();

    if (this.isAtEnd()) {
      return null;
    }

    const token = this.peek();

    // Import: @path
    if (token.type === "import") {
      return this.parseImport();
    }

    // Try to parse a selector block
    const selectorResult = this.tryParseSelector();
    if (selectorResult) {
      return selectorResult;
    }

    // Otherwise, parse as prose
    return this.parseProse();
  }

  /**
   * Try to parse a selector. Returns null if this doesn't look like a selector.
   */
  private tryParseSelector(): ASTNode | null {
    const startPos = this.pos;
    const startLocation = this.currentLocation();

    // Parse selector chain (may include combinators)
    const selectorChain = this.parseSelectorChain();

    if (selectorChain.length === 0) {
      this.pos = startPos;
      return null;
    }

    // After parsing the selector, we need a brace_open
    this.skipWhitespaceAndNewlines();
    this.skipComments();

    if (!this.check("brace_open")) {
      // Not a block, restore position
      this.pos = startPos;
      return null;
    }

    // Consume the opening brace
    this.advance();

    // Parse children
    const children = this.parseBlockContent();

    // Expect closing brace
    this.skipWhitespaceAndNewlines();
    this.skipComments();

    const endLocation = this.currentLocation();

    if (this.check("brace_close")) {
      this.advance();
    } else {
      this.addError("Expected closing brace '}'", {
        start: endLocation,
        end: endLocation,
      });
    }

    // Build the AST node(s) from the selector chain
    // The last selector in the chain becomes the actual block node,
    // with earlier selectors becoming parent nodes
    return this.buildSelectorTree(selectorChain, children, {
      start: startLocation,
      end: this.previousLocation(),
    });
  }

  /**
   * Parse a selector chain, handling combinators.
   * Returns an array of parsed selectors with their combinators.
   */
  private parseSelectorChain(): SelectorPart[] {
    const parts: SelectorPart[] = [];
    let expectCombinator = false;

    while (!this.isAtEnd()) {
      this.skipComments();

      // Check for combinators
      const combinator = this.parseCombinator(expectCombinator);

      // After a combinator, we need another selector
      if (combinator) {
        if (parts.length === 0) {
          // Combinator at start - invalid
          break;
        }
        // The combinator attaches to the next selector
      }

      this.skipComments();

      // Try to parse a selector
      const selector = this.parseSingleSelector();

      if (!selector) {
        if (combinator) {
          // Had a combinator but no following selector
          this.addError("Expected selector after combinator", {
            start: this.currentLocation(),
            end: this.currentLocation(),
          });
        }
        break;
      }

      if (combinator) {
        selector.combinator = combinator;
      } else if (parts.length > 0 && !combinator) {
        // No explicit combinator between selectors = descendant
        selector.combinator = "descendant";
      }

      parts.push(selector);
      expectCombinator = true;

      // Check if there's more to parse
      this.skipWhitespaceOnly();
      this.skipComments();

      // If we see a brace, we're done
      if (this.check("brace_open") || this.check("brace_close")) {
        break;
      }

      // If we see EOF, newline at top-level context, or something that's not a selector start
      if (this.isAtEnd()) {
        break;
      }
    }

    return parts;
  }

  /**
   * Parse a combinator if present.
   */
  private parseCombinator(expectCombinator: boolean): Combinator | undefined {
    this.skipWhitespaceOnly();
    this.skipComments();

    const token = this.peek();

    if (token.type === "gt") {
      this.advance();
      this.skipWhitespaceOnly();
      return "child";
    }

    if (token.type === "plus") {
      this.advance();
      this.skipWhitespaceOnly();
      return "adjacent";
    }

    if (token.type === "tilde") {
      this.advance();
      this.skipWhitespaceOnly();
      return "general";
    }

    // Descendant combinator is implicit (just whitespace)
    // We don't return it here - it's handled in parseSelectorChain
    return undefined;
  }

  /**
   * Parse a single selector (module name, tags, universal, or pseudo-only).
   */
  private parseSingleSelector(): SelectorPart | null {
    const startLocation = this.currentLocation();
    this.skipComments();

    const token = this.peek();

    // Universal selector: *
    if (token.type === "star") {
      this.advance();
      const pseudos = this.parsePseudoSelectors();
      return {
        kind: "universal",
        pseudos,
        startLocation,
      };
    }

    // Pseudo-only selector: :leaf, :root
    if (token.type === "colon") {
      const pseudos = this.parsePseudoSelectors();
      if (pseudos.length > 0) {
        // Check if this is a standalone pseudo block (like :leaf, :root)
        // vs a pseudo attached to something else
        return {
          kind: "pseudo_only",
          pseudo: pseudos[0],
          additionalPseudos: pseudos.slice(1),
          startLocation,
        };
      }
      return null;
    }

    // Tag-only selector: .tag or .tag1.tag2
    if (token.type === "dot") {
      const tags = this.parseTags();
      if (tags.length > 0) {
        const pseudos = this.parsePseudoSelectors();
        return {
          kind: "tag_only",
          tags,
          pseudos,
          startLocation,
        };
      }
      return null;
    }

    // Module selector: name or name.tag
    if (token.type === "identifier") {
      const name = token.value;
      this.advance();

      const tags = this.parseTags();
      const pseudos = this.parsePseudoSelectors();

      return {
        kind: "module",
        name,
        tags,
        pseudos,
        startLocation,
      };
    }

    return null;
  }

  /**
   * Parse tags (.tag1.tag2).
   */
  private parseTags(): string[] {
    const tags: string[] = [];

    // Skip any whitespace/comments before tags
    this.skipInsignificant();

    while (this.check("dot")) {
      this.advance(); // consume '.'
      this.skipInsignificant();
      if (this.check("identifier")) {
        tags.push(this.peek().value);
        this.advance();
        this.skipInsignificant();
      } else {
        this.addError("Expected tag name after '.'", {
          start: this.currentLocation(),
          end: this.currentLocation(),
        });
        break;
      }
    }

    return tags;
  }

  /**
   * Skip whitespace and comments (but not newlines in some contexts).
   */
  private skipInsignificant(): void {
    while (this.check("whitespace") || this.check("comment")) {
      this.advance();
    }
  }

  /**
   * Parse pseudo-selectors (:has(x), :not(y), :leaf, etc.).
   * Only consumes if we see :identifier pattern.
   */
  private parsePseudoSelectors(): PseudoSelector[] {
    const pseudos: PseudoSelector[] = [];

    while (this.check("colon")) {
      // Look ahead to see if this is actually a pseudo-selector
      // A pseudo-selector is : followed by an identifier
      const nextPos = this.pos + 1;
      if (nextPos >= this.tokens.length || this.tokens[nextPos].type !== "identifier") {
        // Not a pseudo-selector, stop
        break;
      }

      this.advance(); // consume ':'

      const name = this.peek().value;
      this.advance();

      // Check for arguments: :has(x, y)
      let args: string[] | undefined;
      if (this.check("paren_open")) {
        this.advance(); // consume '('
        args = this.parsePseudoArgs();

        if (this.check("paren_close")) {
          this.advance(); // consume ')'
        } else {
          this.addError("Expected ')' after pseudo-selector arguments", {
            start: this.currentLocation(),
            end: this.currentLocation(),
          });
        }
      }

      pseudos.push({ name, args });
    }

    return pseudos;
  }

  /**
   * Parse arguments inside a pseudo-selector: :has(arg1, arg2).
   */
  private parsePseudoArgs(): string[] {
    const args: string[] = [];

    while (!this.isAtEnd() && !this.check("paren_close")) {
      this.skipWhitespaceAndNewlines();

      if (this.check("identifier")) {
        args.push(this.peek().value);
        this.advance();
      } else if (this.check("paren_close")) {
        break;
      } else {
        // Skip unexpected token
        this.advance();
      }

      this.skipWhitespaceAndNewlines();

      // Handle comma separator (not tokenized, so we look for identifiers)
      // Actually, commas would become prose tokens, skip them
      if (this.check("prose") && this.peek().value.includes(",")) {
        this.advance();
      }
    }

    return args;
  }

  /**
   * Parse the content inside a block (between { and }).
   */
  private parseBlockContent(): ASTNode[] {
    const children: ASTNode[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndNewlines();
      this.skipComments();

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
    this.skipWhitespaceAndNewlines();
    this.skipComments();

    if (this.isAtEnd() || this.check("brace_close")) {
      return null;
    }

    const token = this.peek();

    // Import
    if (token.type === "import") {
      return this.parseImport();
    }

    // Try to parse a nested selector block
    const selectorResult = this.tryParseSelector();
    if (selectorResult) {
      return selectorResult;
    }

    // Otherwise, parse as prose
    return this.parseProse();
  }

  /**
   * Parse an import node.
   */
  private parseImport(): ImportNode {
    const token = this.peek();
    const startLocation = token.location;

    // Import value includes the @ sign, strip it
    const path = token.value.startsWith("@")
      ? token.value.slice(1)
      : token.value;

    this.advance();

    return {
      type: "import",
      path,
      source: {
        start: startLocation,
        end: this.makeEndLocation(startLocation, token.value.length),
      },
    };
  }

  /**
   * Parse prose content (text, code blocks, !important).
   */
  private parseProse(): ProseNode | null {
    const startLocation = this.currentLocation();
    const parts: string[] = [];
    let important = false;

    while (!this.isAtEnd()) {
      const token = this.peek();

      // Stop conditions
      if (
        token.type === "brace_open" ||
        token.type === "brace_close" ||
        token.type === "eof"
      ) {
        break;
      }

      // Skip comments
      if (token.type === "comment") {
        this.advance();
        continue;
      }

      // Check for !important
      if (token.type === "important") {
        important = true;
        this.advance();
        break;
      }

      // Check if this looks like a selector start followed by a block
      // We need to look ahead to see if there's a block, without adding errors
      if (this.looksLikeSelectorStart()) {
        if (this.looksLikeSelectorBlock()) {
          // It is a selector, stop prose parsing here
          break;
        }
      }

      // Collect the token as prose
      if (token.type === "whitespace") {
        parts.push(token.value);
      } else if (token.type === "newline") {
        // A newline might indicate end of prose in certain contexts
        // For now, include it but check for selector after
        parts.push(token.value);
      } else if (token.type === "identifier") {
        parts.push(token.value);
      } else if (token.type === "prose") {
        parts.push(token.value);
      } else if (token.type === "code_block" || token.type === "inline_code") {
        parts.push(token.value);
      } else if (token.type === "import") {
        // An import in prose context should break
        break;
      } else {
        // Other tokens (operators, etc.) become part of prose
        parts.push(token.value);
      }

      this.advance();
    }

    // Trim and clean up the content
    const content = parts.join("").trim();

    if (content.length === 0 && !important) {
      return null;
    }

    return {
      type: "prose",
      content,
      important,
      source: {
        start: startLocation,
        end: this.previousLocation(),
      },
    };
  }

  /**
   * Check if current position looks like the start of a selector.
   */
  private looksLikeSelectorStart(): boolean {
    const token = this.peek();
    return (
      token.type === "identifier" ||
      token.type === "dot" ||
      token.type === "star" ||
      token.type === "colon"
    );
  }

  /**
   * Look ahead to check if we have a selector followed by a block.
   * This is a quick check without full parsing (no side effects).
   */
  private looksLikeSelectorBlock(): boolean {
    const savedPos = this.pos;
    let braceDepth = 0;

    // Skip tokens that could be part of a selector
    while (!this.isAtEnd()) {
      const token = this.peek();

      if (token.type === "brace_open") {
        // Found opening brace - this looks like a selector block
        this.pos = savedPos;
        return true;
      }

      if (
        token.type === "brace_close" ||
        token.type === "newline" ||
        token.type === "eof"
      ) {
        // Hit something that can't be part of a single-line selector
        // before finding a brace
        break;
      }

      // Keep track of parens for pseudo-selectors like :has(x)
      if (token.type === "paren_open") {
        braceDepth++;
      } else if (token.type === "paren_close") {
        braceDepth--;
      }

      // Skip tokens that could be part of a selector
      if (
        token.type === "identifier" ||
        token.type === "dot" ||
        token.type === "colon" ||
        token.type === "star" ||
        token.type === "gt" ||
        token.type === "plus" ||
        token.type === "tilde" ||
        token.type === "paren_open" ||
        token.type === "paren_close" ||
        token.type === "whitespace" ||
        token.type === "comment"
      ) {
        this.advance();
        continue;
      }

      // Hit something unexpected for a selector
      break;
    }

    this.pos = savedPos;
    return false;
  }

  /**
   * Build a tree of nodes from a selector chain.
   * The last selector in the chain gets the children.
   */
  private buildSelectorTree(
    chain: SelectorPart[],
    children: ASTNode[],
    sourceRange: SourceRange
  ): ASTNode {
    if (chain.length === 0) {
      // Should not happen, but handle gracefully
      return {
        type: "module",
        name: "unknown",
        tags: [],
        pseudos: [],
        children,
        source: sourceRange,
      };
    }

    // Build from the end backwards
    // The last selector gets the children directly
    let currentNode = this.selectorPartToNode(
      chain[chain.length - 1],
      children,
      sourceRange
    );

    // Each previous selector wraps the current as its child
    for (let i = chain.length - 2; i >= 0; i--) {
      currentNode = this.selectorPartToNode(
        chain[i],
        [currentNode],
        sourceRange
      );
    }

    return currentNode;
  }

  /**
   * Convert a SelectorPart to an ASTNode.
   */
  private selectorPartToNode(
    part: SelectorPart,
    children: ASTNode[],
    sourceRange: SourceRange
  ): ASTNode {
    const partSource: SourceRange = {
      start: part.startLocation,
      end: sourceRange.end,
    };

    switch (part.kind) {
      case "module":
        const moduleNode: ModuleNode = {
          type: "module",
          name: part.name!,
          tags: part.tags || [],
          pseudos: part.pseudos || [],
          children,
          source: partSource,
        };
        if (part.combinator) {
          moduleNode.combinator = part.combinator;
        }
        return moduleNode;

      case "tag_only":
        const tagNode: TagBlockNode = {
          type: "tag_block",
          tags: part.tags || [],
          pseudos: part.pseudos || [],
          children,
          source: partSource,
        };
        return tagNode;

      case "universal":
        const universalNode: UniversalBlockNode = {
          type: "universal_block",
          pseudos: part.pseudos || [],
          children,
          source: partSource,
        };
        return universalNode;

      case "pseudo_only":
        const pseudoNode: PseudoBlockNode = {
          type: "pseudo_block",
          pseudo: part.pseudo!,
          children,
          source: partSource,
        };
        return pseudoNode;

      default:
        // Fallback
        return {
          type: "module",
          name: "unknown",
          tags: [],
          pseudos: [],
          children,
          source: partSource,
        };
    }
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
   * Skip whitespace tokens only (not newlines).
   */
  private skipWhitespaceOnly(): void {
    while (this.check("whitespace")) {
      this.advance();
    }
  }

  /**
   * Skip whitespace and newline tokens.
   */
  private skipWhitespaceAndNewlines(): void {
    while (this.check("whitespace") || this.check("newline")) {
      this.advance();
    }
  }

  /**
   * Skip comment tokens.
   */
  private skipComments(): void {
    while (this.check("comment")) {
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
      return this.makeEndLocation(prevToken.location, prevToken.value.length);
    }
    return this.currentLocation();
  }

  /**
   * Create an end location from a start location and length.
   */
  private makeEndLocation(start: SourceLocation, length: number): SourceLocation {
    // Simple approximation - doesn't handle multi-line
    return {
      file: start.file,
      line: start.line,
      column: start.column + length,
      offset: start.offset + length,
    };
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

// =========================================================================
// Internal Types
// =========================================================================

interface SelectorPart {
  kind: "module" | "tag_only" | "universal" | "pseudo_only";
  name?: string;
  tags?: string[];
  pseudos?: PseudoSelector[];
  pseudo?: PseudoSelector;
  additionalPseudos?: PseudoSelector[];
  combinator?: Combinator;
  startLocation: SourceLocation;
}
