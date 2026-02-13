/**
 * AST Parser Tests
 * 
 * Tests for the nginx-like syntax parser.
 */

import { describe, test, expect } from "bun:test";
import { parse } from "../../src/parser/ast.js";
import { tokenize } from "../../src/parser/lexer.js";
import type {
  RootNode,
  ModuleNode,
  QueryFilterNode,
  ProseNode,
  IncludeNode,
  ParameterNode,
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
 * Helper to find a child node by type.
 */
function findChild<T extends ASTNode>(
  children: ASTNode[],
  type: T["type"]
): T | undefined {
  return children.find((c) => c.type === type) as T | undefined;
}

/**
 * Helper to find a module by name.
 */
function findModule(children: ASTNode[], name: string): ModuleNode | undefined {
  return children.find(
    (c) => c.type === "module" && (c as ModuleNode).name === name
  ) as ModuleNode | undefined;
}

describe("AST Parser", () => {
  describe("Module blocks", () => {
    test("parses simple module", () => {
      const { ast, errors } = parseSource("server { }");
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(1);
      
      const module = ast.children[0] as ModuleNode;
      expect(module.type).toBe("module");
      expect(module.name).toBe("server");
      expect(module.children).toHaveLength(0);
    });

    test("parses module with prose content", () => {
      const { ast, errors } = parseSource(`
server {
  This is a REST API server;
}`);
      
      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.children.length).toBe(1);
      
      const prose = module.children[0] as ProseNode;
      expect(prose.type).toBe("prose");
      expect(prose.content).toContain("REST API server");
    });

    test("parses nested modules", () => {
      const { ast, errors } = parseSource(`
server {
  api {
    REST endpoints;
  }
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      expect(server.name).toBe("server");
      
      const api = server.children[0] as ModuleNode;
      expect(api.type).toBe("module");
      expect(api.name).toBe("api");
    });

    test("parses deeply nested modules", () => {
      const { ast, errors } = parseSource(`
a {
  b {
    c {
      d {
        content;
      }
    }
  }
}`);
      
      expect(errors).toHaveLength(0);
      const a = ast.children[0] as ModuleNode;
      const b = a.children[0] as ModuleNode;
      const c = b.children[0] as ModuleNode;
      const d = c.children[0] as ModuleNode;
      
      expect(d.name).toBe("d");
      expect(d.children.length).toBe(1);
    });

    test("parses module with hyphenated name", () => {
      const { ast, errors } = parseSource("email-service { }");
      
      expect(errors).toHaveLength(0);
      const module = ast.children[0] as ModuleNode;
      expect(module.name).toBe("email-service");
    });

    test("parses multiple sibling modules", () => {
      const { ast, errors } = parseSource(`
server { }
client { }
shared { }
`);
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(3);
      
      expect((ast.children[0] as ModuleNode).name).toBe("server");
      expect((ast.children[1] as ModuleNode).name).toBe("client");
      expect((ast.children[2] as ModuleNode).name).toBe("shared");
    });
  });

  describe("Parameters", () => {
    test("parses string parameter", () => {
      const { ast, errors } = parseSource(`
server {
  leaf="single concern";
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      expect(server.parameters.length).toBe(1);
      expect(server.parameters[0].name).toBe("leaf");
      expect(server.parameters[0].value).toBe("single concern");
    });

    test("parses number parameter", () => {
      const { ast, errors } = parseSource(`
server {
  priority=1;
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      expect(server.parameters.length).toBe(1);
      expect(server.parameters[0].name).toBe("priority");
      expect(server.parameters[0].value).toBe(1);
    });

    test("parses multiple parameters", () => {
      const { ast, errors } = parseSource(`
server {
  path="./src";
  leaf="entry point";
  priority=1;
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      expect(server.parameters.length).toBe(3);
    });

    test("separates parameters from children", () => {
      const { ast, errors } = parseSource(`
server {
  leaf="yes";
  This is prose content;
  api { }
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      
      // Parameters are extracted
      expect(server.parameters.length).toBe(1);
      expect(server.parameters[0].name).toBe("leaf");
      
      // Children don't include parameters
      expect(server.children.length).toBe(2);
      expect(server.children[0].type).toBe("prose");
      expect(server.children[1].type).toBe("module");
    });
  });

  describe("Query filter blocks", () => {
    test("parses simple query filter", () => {
      const { ast, errors } = parseSource(`
"is this a database?" {
  Use transactions;
}`);
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(1);
      
      const filter = ast.children[0] as QueryFilterNode;
      expect(filter.type).toBe("query_filter");
      expect(filter.question).toBe("is this a database?");
      expect(filter.children.length).toBe(1);
    });

    test("parses query filter with multiple statements", () => {
      const { ast, errors } = parseSource(`
"handles external services?" {
  Add retry logic;
  Handle timeouts;
  Log all calls;
}`);
      
      expect(errors).toHaveLength(0);
      const filter = ast.children[0] as QueryFilterNode;
      expect(filter.children.length).toBe(3);
    });

    test("parses multiple query filters", () => {
      const { ast, errors } = parseSource(`
"is database?" {
  Transactions;
}

"is api?" {
  Validation;
}`);
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(2);
      expect((ast.children[0] as QueryFilterNode).question).toBe("is database?");
      expect((ast.children[1] as QueryFilterNode).question).toBe("is api?");
    });
  });

  describe("Include statements", () => {
    test("parses include with relative path", () => {
      const { ast, errors } = parseSource("include ./auth;");
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(1);
      
      const include = ast.children[0] as IncludeNode;
      expect(include.type).toBe("include");
      expect(include.path).toBe("./auth");
    });

    test("parses include with extension", () => {
      const { ast, errors } = parseSource("include ./config.aid;");
      
      expect(errors).toHaveLength(0);
      const include = ast.children[0] as IncludeNode;
      expect(include.path).toBe("./config.aid");
    });

    test("parses include without semicolon", () => {
      const { ast, errors } = parseSource("include ./auth\nserver { }");
      
      // Should still parse, semicolons are optional
      const include = findChild<IncludeNode>(ast.children, "include");
      expect(include).toBeDefined();
    });

    test("parses include inside module", () => {
      const { ast, errors } = parseSource(`
server {
  include ./server-config;
  REST API;
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      
      const include = findChild<IncludeNode>(server.children, "include");
      expect(include).toBeDefined();
      expect(include!.path).toBe("./server-config");
    });
  });

  describe("Prose", () => {
    test("parses top-level prose", () => {
      const { ast, errors } = parseSource("This is a simple description;");
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(1);
      
      const prose = ast.children[0] as ProseNode;
      expect(prose.type).toBe("prose");
      expect(prose.content).toContain("simple description");
    });

    test("parses multi-line prose", () => {
      const { ast, errors } = parseSource(`
This is line one
and line two
and line three;`);
      
      expect(errors).toHaveLength(0);
      const prose = ast.children[0] as ProseNode;
      expect(prose.content).toContain("line one");
      expect(prose.content).toContain("line two");
    });

    test("parses prose with code blocks", () => {
      const { ast, errors } = parseSource(`
Here is an example:

\`\`\`typescript
const x = 1;
\`\`\`
`);
      
      expect(errors).toHaveLength(0);
      const prose = ast.children[0] as ProseNode;
      expect(prose.content).toContain("```typescript");
      expect(prose.content).toContain("const x = 1");
    });

    test("parses prose with inline code", () => {
      const { ast, errors } = parseSource("Use the \`server\` module;");
      
      expect(errors).toHaveLength(0);
      const prose = ast.children[0] as ProseNode;
      expect(prose.content).toContain("`server`");
    });

    test("prose stops at module boundary", () => {
      const { ast, errors } = parseSource(`
Some prose content
server { }`);
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(2);
      expect(ast.children[0].type).toBe("prose");
      expect(ast.children[1].type).toBe("module");
    });
  });

  describe("Comments", () => {
    test("skips line comments", () => {
      const { ast, errors } = parseSource(`
// This is a comment
server { }
`);
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(1);
      expect((ast.children[0] as ModuleNode).name).toBe("server");
    });

    test("skips block comments", () => {
      const { ast, errors } = parseSource(`
/* Multi-line
   comment */
server { }
`);
      
      expect(errors).toHaveLength(0);
      expect(ast.children.length).toBe(1);
    });

    test("comments inside modules are skipped", () => {
      const { ast, errors } = parseSource(`
server {
  // comment
  api { }
}`);
      
      expect(errors).toHaveLength(0);
      const server = ast.children[0] as ModuleNode;
      expect(server.children.length).toBe(1);
      expect((server.children[0] as ModuleNode).name).toBe("api");
    });
  });

  describe("Error recovery", () => {
    test("reports missing closing brace", () => {
      const { errors } = parseSource("server {");
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("}");
    });

    test("continues parsing after error", () => {
      const { ast, errors } = parseSource(`
server {

client { }
`);
      
      expect(errors.length).toBeGreaterThan(0);
      // Should still try to parse client
    });

    test("reports missing path after include", () => {
      const { ast, errors } = parseSource("include ;");
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("path");
    });
  });

  describe("Complex examples", () => {
    test("parses full spec", () => {
      const source = `
/*
  Task Manager API
*/

// Global requirements
A REST API for managing tasks;

"is this a database module?" {
  Use transactions;
  Handle errors;
}

server {
  path="./src";
  
  api {
    REST endpoints;
    
    tasks {
      leaf="simple CRUD";
      CRUD for tasks;
    }
  }
  
  db {
    leaf="database layer";
    SQLite connection;
  }
  
  graphql {
    never="out of scope";
  }
}

config {
  leaf="configuration";
  include ./config-utils;
}
`;
      
      const { ast, errors } = parseSource(source);
      
      // May have warnings but should parse
      const modules = ast.children.filter(c => c.type === "module") as ModuleNode[];
      const filters = ast.children.filter(c => c.type === "query_filter") as QueryFilterNode[];
      
      expect(modules.length).toBeGreaterThanOrEqual(2); // server, config
      expect(filters.length).toBe(1);
      
      const server = findModule(ast.children, "server");
      expect(server).toBeDefined();
      expect(server!.parameters.some(p => p.name === "path")).toBe(true);
    });
  });

  describe("Source locations", () => {
    test("tracks module source location", () => {
      const { ast } = parseSource("server { }");
      const module = ast.children[0] as ModuleNode;
      
      expect(module.source.start.line).toBe(1);
      expect(module.source.start.column).toBeGreaterThanOrEqual(1);
    });

    test("tracks parameter source location", () => {
      const { ast } = parseSource(`
server {
  leaf="yes";
}`);
      const server = ast.children[0] as ModuleNode;
      const param = server.parameters[0];
      
      expect(param.source.start.line).toBe(3);
    });
  });
});
