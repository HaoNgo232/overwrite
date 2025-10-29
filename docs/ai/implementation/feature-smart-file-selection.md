---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
feature: smart-file-selection
---

# Implementation Guide

## Development Setup

**How do we get started?**

### Prerequisites

- VS Code Extension development environment set up
- Node.js 18+ and PNPM installed
- TypeScript knowledge
- Understanding of VS Code Extension API
- Familiarity with graph algorithms (BFS)

### Environment Setup Steps

```bash
# Clone repository (if not already)
cd /home/hao/Desktop/Lab/overwrite

# Install dependencies
pnpm install

# Install webview dependencies
cd src/webview-ui
pnpm install
cd ../..

# Build extension
pnpm run build

# Run tests
pnpm run test

# Open in VS Code Extension Development Host
# Press F5 or Run > Start Debugging
```

### Configuration Needed

- Update `package.json` with new configuration settings
- Add TypeScript types in `src/types.ts`
- No external API keys or services needed

## Code Structure

**How is the code organized?**

### Directory Structure

```
src/
├── services/
│   ├── smart-selection-service.ts      # Main orchestrator
│   ├── dependency-analyzer.ts           # Core analysis engine
│   ├── import-parser.ts                 # Import extraction
│   ├── path-resolver.ts                 # Path resolution
│   └── exclusion-filter.ts              # File filtering
├── utils/
│   ├── graph-algorithms.ts              # BFS, cycle detection
│   └── pattern-matcher.ts               # Glob matching
├── providers/
│   └── file-explorer/
│       └── index.ts                     # Add message handlers
├── types.ts                             # TypeScript types
└── webview-ui/src/
    └── components/
        ├── context-tab/
        │   ├── smart-selection-toggle.tsx
        │   └── file-explorer/
        │       └── row-decorations.tsx  # Enhanced
        └── settings-tab/
            └── smart-selection-settings.tsx
```

### Module Organization

- **Services**: Business logic and core algorithms
- **Utils**: Reusable utility functions
- **Providers**: VS Code extension integration
- **Components**: React UI components

### Naming Conventions

- Files: kebab-case (e.g., `smart-selection-service.ts`)
- Classes: PascalCase (e.g., `SmartSelectionService`)
- Functions: camelCase (e.g., `analyzeDependencies`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_MAX_DEPTH`)
- Interfaces: PascalCase with 'I' prefix optional (e.g., `DependencyGraph`)

## Implementation Notes

**Key technical details to remember:**

### Core Features

#### Feature 1: Import Parser

**Implementation Approach**:

- Use regex for fast, resilient parsing
- Support multiple patterns:

  ```typescript
  // ES6 imports
  /import\s+(?:(?:\w+)|(?:\{[^}]+\}))\s+from\s+['"]([^'"]+)['"]/g

  // CommonJS
  /require\s*\(['"]([^'"]+)['"]\)/g

  // Dynamic imports
  /import\s*\(['"]([^'"]+)['"]\)/g
  ```

- Extract import source path (group 1)
- Handle multi-line imports by removing newlines first
- Return structured `ImportStatement` objects

**Edge Cases**:

- Comments containing import-like strings → ignore lines starting with `//` or `/*`
- String literals with "import" or "require" → regex should handle quotes correctly
- Template literals → may cause false positives, acceptable trade-off

#### Feature 2: Path Resolution

**Implementation Approach**:

- Read `tsconfig.json` once and cache
- Parse `compilerOptions.paths` for aliases
- Resolve relative imports using `path.resolve()`
- For each import path:
  1. Check if it's relative (`./`, `../`) → resolve relative to current file
  2. Check if it matches tsconfig path mapping → resolve to mapped path
  3. Check common extensions (`.ts`, `.tsx`, `.js`, `.jsx`) if none specified
  4. Check for `index.ts` in directory if path is directory
  5. Return absolute workspace path

**Edge Cases**:

- Missing file extensions → try all supported extensions
- Barrel exports (`index.ts`) → resolve directory to index file
- Invalid tsconfig → fall back to simple relative resolution
- Node resolution algorithm → not implementing full algorithm, just common cases

#### Feature 3: Dependency Analysis (BFS)

**Implementation Approach**:

```typescript
async function analyze(
  rootPath: string,
  maxDepth: number,
): Promise<DependencyGraph> {
  const graph: DependencyGraph = {
    nodes: new Map(),
    edges: new Map(),
    reverseEdges: new Map(),
    roots: new Set([rootPath]),
    cycles: [],
  };

  const queue: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;

    if (visited.has(path) || depth > maxDepth) {
      continue;
    }

    visited.add(path);

    // Parse imports
    const imports = await importParser.parseImports(path);
    const resolvedPaths = [];

    for (const imp of imports) {
      const resolved = await pathResolver.resolve(imp.source, path);
      if (resolved && !exclusionFilter.shouldExclude(resolved)) {
        resolvedPaths.push(resolved);

        // Add to queue for next level
        queue.push({ path: resolved, depth: depth + 1 });

        // Build edges
        if (!graph.edges.has(path)) {
          graph.edges.set(path, new Set());
        }
        graph.edges.get(path)!.add(resolved);
      }
    }

    // Create node
    graph.nodes.set(path, {
      path,
      imports: imports.map((i) => i.source),
      resolvedImports: resolvedPaths,
      testFiles: await findTestFiles(path),
      depth,
      selectionType: depth === 0 ? "manual" : "auto-dependency",
      isExcluded: false,
    });
  }

  // Detect cycles
  graph.cycles = detectCycles(graph);

  return graph;
}
```

**Key Points**:

- Use queue for BFS (FIFO)
- Track visited set to avoid reprocessing
- Respect max depth
- Build adjacency list while traversing
- Handle async file operations

#### Feature 4: Test File Discovery

**Implementation Approach**:

```typescript
async function findTestFiles(
  sourcePath: string,
  patterns: string[],
): Promise<string[]> {
  const testFiles: string[] = [];
  const dir = path.dirname(sourcePath);
  const basename = path.basename(sourcePath, path.extname(sourcePath));

  // Common test file patterns
  const defaultPatterns = [
    `${basename}.test.ts`,
    `${basename}.test.tsx`,
    `${basename}.spec.ts`,
    `${basename}.spec.tsx`,
    `__tests__/${basename}.test.ts`,
    `__tests__/${basename}.tsx`,
  ];

  const allPatterns = [...defaultPatterns, ...patterns];

  for (const pattern of allPatterns) {
    const testPath = path.join(dir, pattern);
    if (await fileExists(testPath)) {
      testFiles.push(testPath);
    }
  }

  return testFiles;
}
```

### Patterns & Best Practices

#### Pattern 1: Service Layer

- All business logic in services
- Services are stateless (except caching)
- Services use dependency injection for testability
- Example:
  ```typescript
  class DependencyAnalyzer {
    constructor(
      private importParser: ImportParser,
      private pathResolver: PathResolver,
      private exclusionFilter: ExclusionFilter
    ) {}

    async analyze(...) { ... }
  }
  ```

#### Pattern 2: Error Handling

- Never throw errors that crash the extension
- Log errors for debugging
- Return partial results when possible
- Show user-friendly error messages in UI
- Example:
  ```typescript
  try {
    const imports = await this.parseImports(path);
  } catch (error) {
    console.error(`Failed to parse ${path}:`, error);
    // Return empty array instead of crashing
    return [];
  }
  ```

#### Pattern 3: Caching

- Cache tsconfig paths (read once per workspace)
- Cache parsed imports (invalidate on file change)
- Cache .gitignore patterns
- Use WeakMap for memory-efficient caching
- Example:

  ```typescript
  private importCache = new Map<string, ImportStatement[]>();

  async parseImports(filePath: string): Promise<ImportStatement[]> {
    if (this.importCache.has(filePath)) {
      return this.importCache.get(filePath)!;
    }

    const imports = await this._parseImportsImpl(filePath);
    this.importCache.set(filePath, imports);
    return imports;
  }
  ```

#### Pattern 4: Message Passing

- Use request-response pattern with unique IDs
- Handle timeouts (reject promise after 10s)
- Example:

  ```typescript
  // Webview
  const requestId = generateId();
  const promise = new Promise((resolve, reject) => {
    const handler = (event) => {
      const message = event.data;
      if (
        message.command === "dependenciesResponse" &&
        message.requestId === requestId
      ) {
        window.removeEventListener("message", handler);
        resolve(message.graph);
      }
    };
    window.addEventListener("message", handler);
    setTimeout(() => reject(new Error("Timeout")), 10000);
  });

  vscode.postMessage({
    command: "getDependencies",
    payload: { filePath, requestId },
  });
  return promise;
  ```

## Integration Points

**How do pieces connect?**

### Extension Host ↔ Webview Communication

- Webview sends `getDependencies` → Extension responds with `dependenciesResponse`
- Webview sends `toggleSmartSelection` → Extension updates config and responds
- Extension sends `smartSelectionStatus` on config change

### File Selection State Integration

- When smart selection triggers:
  1. Get current selection from state
  2. Analyze dependencies for newly selected file
  3. Compute selection delta (files to add/remove)
  4. Update state with metadata
  5. Notify webview to re-render

### VS Code APIs Used

- `vscode.workspace.fs.readFile()` - Read file contents
- `vscode.workspace.fs.stat()` - Check file existence
- `vscode.workspace.findFiles()` - Find test files
- `vscode.workspace.getConfiguration()` - Read settings
- `vscode.window.showErrorMessage()` - Show errors
- `vscode.window.withProgress()` - Show progress indicator

## Error Handling

**How do we handle failures?**

### Error Handling Strategy

#### Level 1: Graceful Degradation

- If import parsing fails for one file → skip it, continue with others
- If path resolution fails → log warning, skip import
- If test file not found → no error, just no test files

#### Level 2: User Notification

- If entire analysis fails → show error message with "Try again" button
- If performance is slow → show progress indicator
- If too many files selected → warn user and ask for confirmation

#### Level 3: Logging

- Log all errors to console for debugging
- Include context (file path, operation, error message)
- Use different log levels (error, warn, info, debug)
- Example:
  ```typescript
  console.error(`[SmartSelection] Failed to analyze ${filePath}:`, error);
  console.warn(
    `[SmartSelection] Could not resolve import "${importPath}" in ${filePath}`,
  );
  console.info(
    `[SmartSelection] Analysis completed: ${fileCount} files in ${duration}ms`,
  );
  ```

### Retry/Fallback Mechanisms

- No automatic retries (user can manually retry)
- Fallback to manual selection if smart selection fails
- Smart selection is opt-in, so failure doesn't break core functionality

## Performance Considerations

**How do we keep it fast?**

### Optimization Strategies

#### 1. Caching

- Cache parsed imports until file changes
- Cache tsconfig paths for entire session
- Cache .gitignore patterns
- Clear caches on workspace config change

#### 2. Batching

- Read multiple files in parallel using `Promise.all()`
- Batch file existence checks
- Process imports in chunks

#### 3. Lazy Loading

- Don't analyze dependencies until user triggers smart selection
- Don't load tsconfig until first path resolution needed
- Defer test file search until needed

#### 4. Short-Circuiting

- Stop BFS early if max depth reached
- Skip excluded files immediately
- Don't parse files that are already visited

#### 5. Async/Await

- Never block the extension host
- Use async file operations
- Show progress indicator for operations > 1s

### Caching Approach

```typescript
class ImportParserCache {
  private cache = new Map<
    string,
    {
      imports: ImportStatement[];
      timestamp: number;
    }
  >();

  async get(filePath: string): Promise<ImportStatement[] | null> {
    const cached = this.cache.get(filePath);
    if (!cached) return null;

    // Check if file has been modified
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    if (stat.mtime > cached.timestamp) {
      this.cache.delete(filePath);
      return null;
    }

    return cached.imports;
  }

  set(filePath: string, imports: ImportStatement[]): void {
    this.cache.set(filePath, {
      imports,
      timestamp: Date.now(),
    });
  }
}
```

### Query Optimization

- Build reverse dependency graph for fast "who imports this" queries
- Use Set for fast membership tests
- Use Map for O(1) lookups

### Resource Management

- Clear caches on workspace change
- Limit maximum graph size (warn if > 500 files)
- Cancel in-progress analysis if user triggers new one

## Security Notes

**What security measures are in place?**

### Authentication/Authorization

- N/A (local extension, no external auth)

### Input Validation

- Validate file paths are within workspace
- Sanitize glob patterns to prevent ReDoS:
  ```typescript
  function isValidGlob(pattern: string): boolean {
    // Reject patterns with excessive nesting or repetition
    if (/(\*\*){3,}/.test(pattern)) return false;
    if (/(\{[^}]*){5,}/.test(pattern)) return false;
    return true;
  }
  ```
- Validate user-defined test patterns

### Data Encryption

- N/A (no sensitive data)

### Secrets Management

- N/A (no secrets)

### Additional Security Measures

- **Path Traversal Prevention**: Always resolve paths relative to workspace root
- **Code Execution Prevention**: Never use `eval()` or `Function()` on parsed code
- **Denial of Service Prevention**:
  - Limit max depth (default 5, max 20)
  - Limit max files in graph (warn at 500, abort at 1000)
  - Timeout long-running operations (10s)
- **File System Access**: Only read files, never write during analysis
