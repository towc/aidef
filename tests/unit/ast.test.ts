import { describe, test, expect } from "bun:test";
import { parse } from "../../src/parser/ast.js";
import { tokenize } from "../../src/parser/lexer.js";
import type {
  RootNode,
  ModuleNode,
  TagBlockNode,
  UniversalBlockNode,
  PseudoBlockNode,
  ProseNode,
  ImportNode,
  ASTNode,
} from "../../src/types/index.js";

/**
 * Helper to parse source code and return the AST.
 */
function parseSource(source: string, filename = "test.aid") {
  const { tokens } = tokenize(source, filename);
  return parse(tokens, filename);
}

/**
 * Helper to get a specific child type from children array.
 */
function findChild<T extends ASTNode>(
  children: ASTNode[],
  type: T["type"]
): T | undefined {
  return children.find((c) => c.type === type) as T | undefined;
}

/**
 * Helper to get all children of a specific type.
 */
function findAllChildren<T extends ASTNode>(
  children: ASTNode[],
  type: T["type"]
): T[] {
  return children.filter((c) => c.type === type) as T[];
}

describe("AST Parser", () => {
  describe("Simple module blocks", () => {
    test("parses empty module block: server { }", () => {
      const { ast, errors } = parseSource("server { }");

      expect(errors).toHaveLength(0);
      expect(ast.type).toBe("root");
      expect(ast.children).toHaveLength(1);

      const module = ast.children[0] as ModuleNode;
      expect(module.type).toBe("module");
      expect(module.name).toBe("server");
      expect(module.tags).toHaveLength(0);
      expect(module.pseudos).toHaveLength(0);
      expect(module.children).toHaveLength(0);
    });

    test("parses module with prose content: server { content }", () => {
      const { ast, errors } = parseSource("server { some content here }");

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.children).toHaveLength(1);

      const prose = module.children[0] as ProseNode;
      expect(prose.type).toBe("prose");
      expect(prose.content).toBe("some content here");
      expect(prose.important).toBe(false);
    });

    test("parses module with multiline prose", () => {
      const source = `server {
  Handle API requests
  Process data
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      const proseNodes = findAllChildren<ProseNode>(module.children, "prose");
      expect(proseNodes.length).toBeGreaterThan(0);
    });
  });

  describe("Nested modules", () => {
    test("parses nested module: server { api { } }", () => {
      const { ast, errors } = parseSource("server { api { } }");

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      expect(server.name).toBe("server");

      const api = findChild<ModuleNode>(server.children, "module");
      expect(api).toBeDefined();
      expect(api!.name).toBe("api");
    });

    test("parses deeply nested modules", () => {
      const source = "a { b { c { d { } } } }";
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);

      const a = ast.children[0] as ModuleNode;
      expect(a.name).toBe("a");

      const b = findChild<ModuleNode>(a.children, "module");
      expect(b!.name).toBe("b");

      const c = findChild<ModuleNode>(b!.children, "module");
      expect(c!.name).toBe("c");

      const d = findChild<ModuleNode>(c!.children, "module");
      expect(d!.name).toBe("d");
    });

    test("parses multiple siblings at same level", () => {
      const source = `server {
  api { }
  auth { }
  db { }
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      const modules = findAllChildren<ModuleNode>(server.children, "module");

      expect(modules).toHaveLength(3);
      expect(modules.map((m) => m.name)).toEqual(["api", "auth", "db"]);
    });
  });

  describe("Tag blocks", () => {
    test("parses single tag: .api { }", () => {
      const { ast, errors } = parseSource(".api { }");

      expect(errors).toHaveLength(0);
      const tag = ast.children[0] as TagBlockNode;
      expect(tag.type).toBe("tag_block");
      expect(tag.tags).toEqual(["api"]);
    });

    test("parses multiple tags: .api.http { }", () => {
      const { ast, errors } = parseSource(".api.http { }");

      expect(errors).toHaveLength(0);
      const tag = ast.children[0] as TagBlockNode;
      expect(tag.type).toBe("tag_block");
      expect(tag.tags).toEqual(["api", "http"]);
    });

    test("parses three tags: .public.readonly.cached { }", () => {
      const { ast, errors } = parseSource(".public.readonly.cached { }");

      expect(errors).toHaveLength(0);
      const tag = ast.children[0] as TagBlockNode;
      expect(tag.tags).toEqual(["public", "readonly", "cached"]);
    });

    test("tag block with content", () => {
      const { ast, errors } = parseSource(".api { all API endpoints }");

      expect(errors).toHaveLength(0);
      const tag = ast.children[0] as TagBlockNode;
      const prose = findChild<ProseNode>(tag.children, "prose");
      expect(prose!.content).toBe("all API endpoints");
    });
  });

  describe("Combined selectors (module with tags)", () => {
    test("parses module with single tag: server.api { }", () => {
      const { ast, errors } = parseSource("server.api { }");

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.type).toBe("module");
      expect(module.name).toBe("server");
      expect(module.tags).toEqual(["api"]);
    });

    test("parses module with multiple tags: server.api.public { }", () => {
      const { ast, errors } = parseSource("server.api.public { }");

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.name).toBe("server");
      expect(module.tags).toEqual(["api", "public"]);
    });
  });

  describe("Universal blocks", () => {
    test("parses universal selector: * { }", () => {
      const { ast, errors } = parseSource("* { }");

      expect(errors).toHaveLength(0);
      const universal = ast.children[0] as UniversalBlockNode;
      expect(universal.type).toBe("universal_block");
    });

    test("universal block with content", () => {
      const { ast, errors } = parseSource("* { apply to all modules }");

      expect(errors).toHaveLength(0);
      const universal = ast.children[0] as UniversalBlockNode;
      const prose = findChild<ProseNode>(universal.children, "prose");
      expect(prose!.content).toBe("apply to all modules");
    });
  });

  describe("Pseudo-selectors", () => {
    test("parses standalone :leaf selector", () => {
      const { ast, errors } = parseSource(":leaf { }");

      expect(errors).toHaveLength(0);
      const pseudo = ast.children[0] as PseudoBlockNode;
      expect(pseudo.type).toBe("pseudo_block");
      expect(pseudo.pseudo.name).toBe("leaf");
      expect(pseudo.pseudo.args).toBeUndefined();
    });

    test("parses standalone :root selector", () => {
      const { ast, errors } = parseSource(":root { }");

      expect(errors).toHaveLength(0);
      const pseudo = ast.children[0] as PseudoBlockNode;
      expect(pseudo.pseudo.name).toBe("root");
    });

    test("parses pseudo with single argument: :has(db) { }", () => {
      const { ast, errors } = parseSource(":has(db) { }");

      expect(errors).toHaveLength(0);
      const pseudo = ast.children[0] as PseudoBlockNode;
      expect(pseudo.pseudo.name).toBe("has");
      expect(pseudo.pseudo.args).toEqual(["db"]);
    });

    test("parses pseudo with multiple arguments: :or(a, b, c) { }", () => {
      const { ast, errors } = parseSource(":or(a b c) { }");

      expect(errors).toHaveLength(0);
      const pseudo = ast.children[0] as PseudoBlockNode;
      expect(pseudo.pseudo.name).toBe("or");
      expect(pseudo.pseudo.args).toEqual(["a", "b", "c"]);
    });

    test("parses module with pseudo: server:has(db) { }", () => {
      const { ast, errors } = parseSource("server:has(db) { }");

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.name).toBe("server");
      expect(module.pseudos).toHaveLength(1);
      expect(module.pseudos[0].name).toBe("has");
      expect(module.pseudos[0].args).toEqual(["db"]);
    });

    test("parses module with :not pseudo: server:not(legacy) { }", () => {
      const { ast, errors } = parseSource("server:not(legacy) { }");

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.pseudos[0].name).toBe("not");
      expect(module.pseudos[0].args).toEqual(["legacy"]);
    });

    test("parses tag with pseudo: .api:not(deprecated) { }", () => {
      const { ast, errors } = parseSource(".api:not(deprecated) { }");

      expect(errors).toHaveLength(0);
      const tag = ast.children[0] as TagBlockNode;
      expect(tag.tags).toEqual(["api"]);
      expect(tag.pseudos).toHaveLength(1);
      expect(tag.pseudos[0].name).toBe("not");
    });

    test("parses multiple pseudos: server:has(db):not(legacy) { }", () => {
      const { ast, errors } = parseSource("server:has(db):not(legacy) { }");

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.pseudos).toHaveLength(2);
      expect(module.pseudos[0].name).toBe("has");
      expect(module.pseudos[1].name).toBe("not");
    });
  });

  describe("Combinators", () => {
    test("parses child combinator: parent > child { }", () => {
      const { ast, errors } = parseSource("parent > child { }");

      expect(errors).toHaveLength(0);
      // The outer node is 'parent', which contains 'child' with 'child' combinator
      const parent = ast.children[0] as ModuleNode;
      expect(parent.name).toBe("parent");

      const child = findChild<ModuleNode>(parent.children, "module");
      expect(child!.name).toBe("child");
      expect(child!.combinator).toBe("child");
    });

    test("parses adjacent combinator: a + b { }", () => {
      const { ast, errors } = parseSource("a + b { }");

      expect(errors).toHaveLength(0);
      const a = ast.children[0] as ModuleNode;
      expect(a.name).toBe("a");

      const b = findChild<ModuleNode>(a.children, "module");
      expect(b!.name).toBe("b");
      expect(b!.combinator).toBe("adjacent");
    });

    test("parses general combinator: a ~ b { }", () => {
      const { ast, errors } = parseSource("a ~ b { }");

      expect(errors).toHaveLength(0);
      const a = ast.children[0] as ModuleNode;
      const b = findChild<ModuleNode>(a.children, "module");
      expect(b!.combinator).toBe("general");
    });

    test("parses descendant combinator (implicit): parent child { }", () => {
      const { ast, errors } = parseSource("parent child { }");

      expect(errors).toHaveLength(0);
      const parent = ast.children[0] as ModuleNode;
      expect(parent.name).toBe("parent");

      const child = findChild<ModuleNode>(parent.children, "module");
      expect(child!.name).toBe("child");
      expect(child!.combinator).toBe("descendant");
    });

    test("parses multiple combinators: a > b + c { }", () => {
      const { ast, errors } = parseSource("a > b + c { }");

      expect(errors).toHaveLength(0);
      const a = ast.children[0] as ModuleNode;
      expect(a.name).toBe("a");

      const b = findChild<ModuleNode>(a.children, "module");
      expect(b!.name).toBe("b");
      expect(b!.combinator).toBe("child");

      const c = findChild<ModuleNode>(b!.children, "module");
      expect(c!.name).toBe("c");
      expect(c!.combinator).toBe("adjacent");
    });

    test("parses combinator with tags: parent.tag > child.other { }", () => {
      const { ast, errors } = parseSource("parent.tag > child.other { }");

      expect(errors).toHaveLength(0);
      const parent = ast.children[0] as ModuleNode;
      expect(parent.name).toBe("parent");
      expect(parent.tags).toEqual(["tag"]);

      const child = findChild<ModuleNode>(parent.children, "module");
      expect(child!.name).toBe("child");
      expect(child!.tags).toEqual(["other"]);
      expect(child!.combinator).toBe("child");
    });
  });

  describe("Prose nodes", () => {
    test("parses top-level prose", () => {
      const { ast, errors } = parseSource("This is top level prose");

      expect(errors).toHaveLength(0);
      // Top-level prose should be captured
      const prose = findChild<ProseNode>(ast.children, "prose");
      expect(prose).toBeDefined();
      expect(prose!.content).toContain("This");
    });

    test("parses prose with !important", () => {
      const { ast, errors } = parseSource("server { Must be secure !important }");

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      const prose = findChild<ProseNode>(server.children, "prose");
      expect(prose!.important).toBe(true);
      expect(prose!.content).toBe("Must be secure");
    });

    test("parses standalone !important after prose", () => {
      const { ast, errors } = parseSource("server { critical rule !important }");

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      const proseNodes = findAllChildren<ProseNode>(server.children, "prose");

      // Should have a prose node marked as important
      expect(proseNodes.some((p) => p.important)).toBe(true);
    });

    test("parses prose between nested blocks", () => {
      const source = `server {
  some intro text
  api { }
  more text
  auth { }
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;

      const modules = findAllChildren<ModuleNode>(server.children, "module");
      const proseNodes = findAllChildren<ProseNode>(server.children, "prose");

      expect(modules).toHaveLength(2);
      expect(proseNodes.length).toBeGreaterThan(0);
    });

    test("preserves code blocks in prose", () => {
      const source = "server { Use `const x = 1` for initialization }";
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      const prose = findChild<ProseNode>(server.children, "prose");
      expect(prose!.content).toContain("`const x = 1`");
    });

    test("preserves fenced code blocks in prose", () => {
      const source = `server {
  Example code:
  \`\`\`typescript
  function hello() {}
  \`\`\`
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      const proseNodes = findAllChildren<ProseNode>(server.children, "prose");
      const hasCodeBlock = proseNodes.some((p) => p.content.includes("```"));
      expect(hasCodeBlock).toBe(true);
    });
  });

  describe("Import nodes", () => {
    test("parses local import: @./file", () => {
      const { ast, errors } = parseSource("@./file");

      expect(errors).toHaveLength(0);
      const imp = ast.children[0] as ImportNode;
      expect(imp.type).toBe("import");
      expect(imp.path).toBe("./file");
    });

    test("parses import with extension: @./file.aid", () => {
      const { ast, errors } = parseSource("@./file.aid");

      expect(errors).toHaveLength(0);
      const imp = ast.children[0] as ImportNode;
      expect(imp.path).toBe("./file.aid");
    });

    test("parses parent directory import: @../shared/utils", () => {
      const { ast, errors } = parseSource("@../shared/utils");

      expect(errors).toHaveLength(0);
      const imp = ast.children[0] as ImportNode;
      expect(imp.path).toBe("../shared/utils");
    });

    test("parses URL import", () => {
      const { ast, errors } = parseSource("@https://example.com/spec.aid");

      expect(errors).toHaveLength(0);
      const imp = ast.children[0] as ImportNode;
      expect(imp.path).toBe("https://example.com/spec.aid");
    });

    test("parses import inside block", () => {
      const { ast, errors } = parseSource("server { @./shared }");

      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      const imp = findChild<ImportNode>(server.children, "import");
      expect(imp).toBeDefined();
      expect(imp!.path).toBe("./shared");
    });

    test("parses multiple imports", () => {
      const source = `@./types
@./utils
server { }`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const imports = findAllChildren<ImportNode>(ast.children, "import");
      expect(imports).toHaveLength(2);
    });
  });

  describe("Deep nesting", () => {
    test("parses 5-level nesting", () => {
      const source = "a { b { c { d { e { content } } } } }";
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);

      let current: ModuleNode = ast.children[0] as ModuleNode;
      const names = [current.name];

      while (current.children.length > 0) {
        const nextModule = findChild<ModuleNode>(current.children, "module");
        if (nextModule) {
          names.push(nextModule.name);
          current = nextModule;
        } else {
          break;
        }
      }

      expect(names).toEqual(["a", "b", "c", "d", "e"]);

      // The innermost should have prose
      const prose = findChild<ProseNode>(current.children, "prose");
      expect(prose!.content).toBe("content");
    });

    test("parses nested with mixed content", () => {
      const source = `app {
  intro text
  server {
    api {
      Handle requests
      !important
    }
    db {
      Store data
    }
  }
  more text
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const app = ast.children[0] as ModuleNode;

      const server = findChild<ModuleNode>(app.children, "module");
      expect(server!.name).toBe("server");

      const apiAndDb = findAllChildren<ModuleNode>(server!.children, "module");
      expect(apiAndDb).toHaveLength(2);
    });
  });

  describe("Error recovery", () => {
    test("recovers from missing closing brace", () => {
      const { ast, errors } = parseSource("server { api { }");

      // Should have an error
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Expected closing brace");

      // But still produce a partial AST
      expect(ast.children.length).toBeGreaterThan(0);
    });

    test("recovers from missing selector name after dot", () => {
      const { ast, errors } = parseSource(". { }");

      // Should have an error
      expect(errors.length).toBeGreaterThan(0);
    });

    test("continues parsing after error", () => {
      const source = `server { 
  api { 
valid { }`;
      const { ast, errors } = parseSource(source);

      // Should have errors but still attempt to parse
      expect(errors.length).toBeGreaterThan(0);
    });

    test("handles empty selector", () => {
      const { ast, errors } = parseSource("{ content }");

      // Braces without selector - should be treated as prose or error
      // The behavior depends on implementation - just ensure no crash
      expect(ast).toBeDefined();
    });
  });

  describe("Source range tracking", () => {
    test("tracks source range for module", () => {
      const { ast } = parseSource("server { }");

      const module = ast.children[0] as ModuleNode;
      expect(module.source).toBeDefined();
      expect(module.source.start.line).toBe(1);
      expect(module.source.start.column).toBe(1);
    });

    test("tracks source range for nested elements", () => {
      const source = `server {
  api { }
}`;
      const { ast } = parseSource(source);

      const server = ast.children[0] as ModuleNode;
      expect(server.source.start.line).toBe(1);

      const api = findChild<ModuleNode>(server.children, "module");
      expect(api!.source.start.line).toBe(2);
    });

    test("tracks source range for imports", () => {
      const { ast } = parseSource("@./file");

      const imp = ast.children[0] as ImportNode;
      expect(imp.source.start.offset).toBe(0);
      expect(imp.source.start.column).toBe(1);
    });

    test("root node has source range spanning entire file", () => {
      const source = `server { }
api { }`;
      const { ast } = parseSource(source);

      expect(ast.source.start.line).toBe(1);
      expect(ast.source.start.offset).toBe(0);
    });

    test("tracks filename in source locations", () => {
      const { ast } = parseSource("server { }", "my/custom/file.aid");

      const module = ast.children[0] as ModuleNode;
      expect(module.source.start.file).toBe("my/custom/file.aid");
    });
  });

  describe("Comments", () => {
    test("skips line comments", () => {
      const source = `// This is a comment
server { }`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const module = findChild<ModuleNode>(ast.children, "module");
      expect(module).toBeDefined();
      expect(module!.name).toBe("server");
    });

    test("skips block comments", () => {
      const source = `/* Comment */ server { /* inner */ }`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const module = findChild<ModuleNode>(ast.children, "module");
      expect(module).toBeDefined();
    });

    test("skips comments in selector", () => {
      const source = `server /* comment */ .api { }`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.name).toBe("server");
      expect(module.tags).toContain("api");
    });
  });

  describe("Complex examples", () => {
    test("parses full module definition with everything", () => {
      const source = `@./shared/types

// Main server module
server.public:has(api) {
  Handle HTTP requests
  
  api > endpoints {
    REST API implementation
    !important
  }
  
  .internal {
    Private helpers
  }
}

* {
  Global rules
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);

      // Check import
      const imports = findAllChildren<ImportNode>(ast.children, "import");
      expect(imports).toHaveLength(1);

      // Check server module
      const server = findChild<ModuleNode>(ast.children, "module");
      expect(server).toBeDefined();
      expect(server!.name).toBe("server");
      expect(server!.tags).toContain("public");
      expect(server!.pseudos[0].name).toBe("has");

      // Check universal
      const universal = findChild<UniversalBlockNode>(
        ast.children,
        "universal_block"
      );
      expect(universal).toBeDefined();
    });

    test("parses real-world example structure", () => {
      const source = `@./conventions

root {
  Application root module
  
  server {
    Backend services
    
    api.rest {
      REST endpoints
    }
    
    api.graphql {
      GraphQL endpoints  
    }
    
    db:has(postgres) {
      Database layer
    }
  }
  
  client {
    Frontend application
    
    components {
      React components
    }
    
    state {
      State management
    }
  }
}

:leaf {
  All leaf modules should generate code
}`;
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);

      const root = findChild<ModuleNode>(ast.children, "module");
      expect(root!.name).toBe("root");

      const server = findChild<ModuleNode>(root!.children, "module");
      expect(server!.name).toBe("server");

      const leaf = findChild<PseudoBlockNode>(ast.children, "pseudo_block");
      expect(leaf!.pseudo.name).toBe("leaf");
    });
  });

  describe("Edge cases", () => {
    test("handles empty input", () => {
      const { ast, errors } = parseSource("");

      expect(errors).toHaveLength(0);
      expect(ast.type).toBe("root");
      expect(ast.children).toHaveLength(0);
    });

    test("handles only whitespace", () => {
      const { ast, errors } = parseSource("   \n\n   ");

      expect(errors).toHaveLength(0);
      expect(ast.children).toHaveLength(0);
    });

    test("handles only comments", () => {
      const { ast, errors } = parseSource("// comment\n/* block */");

      expect(errors).toHaveLength(0);
      // Comments are skipped, so no children
    });

    test("handles identifier that looks like selector but isn't", () => {
      const source = "just some text without braces";
      const { ast, errors } = parseSource(source);

      // Should be parsed as prose
      expect(errors).toHaveLength(0);
      const prose = findChild<ProseNode>(ast.children, "prose");
      expect(prose).toBeDefined();
    });

    test("handles consecutive empty blocks", () => {
      const source = "a { } b { } c { }";
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      const modules = findAllChildren<ModuleNode>(ast.children, "module");
      expect(modules).toHaveLength(3);
    });

    test("handles block immediately after another", () => {
      const source = "a { }b { }";
      const { ast, errors } = parseSource(source);

      expect(errors).toHaveLength(0);
      // Should parse as two separate modules
      const modules = findAllChildren<ModuleNode>(ast.children, "module");
      expect(modules).toHaveLength(2);
    });
  });
});
