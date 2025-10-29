---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
feature: smart-file-selection
---

# Testing Strategy

## Test Coverage Goals

**What level of testing do we aim for?**

- **Unit Test Coverage**: 85%+ for all new services and utilities
- **Integration Test Coverage**: All critical workflows (file selection, dependency analysis)
- **End-to-End Test Coverage**: Key user journeys (enable smart selection → select file → verify auto-selections)
- **Performance Tests**: Verify P95 < 500ms, P99 < 3s for dependency analysis
- **Alignment**: All acceptance criteria from requirements doc must have corresponding tests

## Unit Tests

**What individual components need testing?**

### Component 1: Import Parser (`import-parser.ts`)

**Coverage Goal**: 90%+

- [ ] **TC-IP-01**: Parse ES6 import statement

  - Input: `import { foo } from './bar'`
  - Expected: `{ source: './bar', type: 'es6', specifiers: ['foo'] }`

- [ ] **TC-IP-02**: Parse ES6 default import

  - Input: `import foo from './bar'`
  - Expected: `{ source: './bar', type: 'es6', specifiers: ['default'] }`

- [ ] **TC-IP-03**: Parse CommonJS require

  - Input: `const foo = require('./bar')`
  - Expected: `{ source: './bar', type: 'commonjs' }`

- [ ] **TC-IP-04**: Parse dynamic import

  - Input: `import('./bar').then(...)`
  - Expected: `{ source: './bar', type: 'dynamic' }`

- [ ] **TC-IP-05**: Parse multi-line import

  - Input:
    ```typescript
    import { foo, bar } from "./baz";
    ```
  - Expected: `{ source: './baz', type: 'es6' }`

- [ ] **TC-IP-06**: Ignore commented imports

  - Input: `// import foo from './bar'`
  - Expected: Empty array

- [ ] **TC-IP-07**: Handle multiple imports in one file

  - Input: File with 5 different imports
  - Expected: Array with 5 ImportStatement objects

- [ ] **TC-IP-08**: Handle import in string literal (false positive)

  - Input: `const str = "import foo from './bar'"`
  - Expected: Should not parse as import

- [ ] **TC-IP-09**: Handle malformed import gracefully

  - Input: `import {{{ from './bar'`
  - Expected: Empty array or skip invalid line

- [ ] **TC-IP-10**: Parse file with no imports
  - Input: Pure logic file with no imports
  - Expected: Empty array

### Component 2: Path Resolver (`path-resolver.ts`)

**Coverage Goal**: 90%+

- [ ] **TC-PR-01**: Resolve relative import (same directory)

  - Current file: `/workspace/src/foo.ts`
  - Import: `./bar`
  - Expected: `/workspace/src/bar.ts`

- [ ] **TC-PR-02**: Resolve relative import (parent directory)

  - Current file: `/workspace/src/foo.ts`
  - Import: `../utils/bar`
  - Expected: `/workspace/utils/bar.ts`

- [ ] **TC-PR-03**: Resolve tsconfig path alias

  - tsconfig: `{ "paths": { "@/*": ["src/*"] } }`
  - Import: `@/utils/bar`
  - Expected: `/workspace/src/utils/bar.ts`

- [ ] **TC-PR-04**: Resolve barrel export (index.ts)

  - Import: `./components`
  - Directory has: `./components/index.ts`
  - Expected: `/workspace/src/components/index.ts`

- [ ] **TC-PR-05**: Add missing .ts extension

  - Import: `./bar` (no extension)
  - File exists: `./bar.ts`
  - Expected: `/workspace/src/bar.ts`

- [ ] **TC-PR-06**: Try multiple extensions (.ts, .tsx, .js, .jsx)

  - Import: `./Component`
  - File exists: `./Component.tsx`
  - Expected: `/workspace/src/Component.tsx`

- [ ] **TC-PR-07**: Handle missing tsconfig gracefully

  - No tsconfig.json in workspace
  - Import: `@/foo`
  - Expected: null (cannot resolve)

- [ ] **TC-PR-08**: Handle invalid import path

  - Import: `./nonexistent`
  - Expected: null

- [ ] **TC-PR-09**: Cache tsconfig paths

  - Resolve 10 imports with same tsconfig
  - Expected: tsconfig only read once

- [ ] **TC-PR-10**: Resolve node_modules import
  - Import: `react`
  - Expected: null (excluded)

### Component 3: Exclusion Filter (`exclusion-filter.ts`)

**Coverage Goal**: 85%+

- [ ] **TC-EF-01**: Exclude node_modules

  - Path: `/workspace/node_modules/react/index.js`
  - Expected: true (excluded)

- [ ] **TC-EF-02**: Exclude .gitignore pattern

  - .gitignore: `*.log`
  - Path: `/workspace/app.log`
  - Expected: true (excluded)

- [ ] **TC-EF-03**: Exclude package.json dependency

  - package.json: `{ "dependencies": { "lodash": "^4.0.0" } }`
  - Import: `lodash`
  - Expected: true (excluded)

- [ ] **TC-EF-04**: Include workspace file

  - Path: `/workspace/src/index.ts`
  - Expected: false (not excluded)

- [ ] **TC-EF-05**: Exclude user-defined pattern

  - Config: `{ "exclusionPatterns": ["*.test.ts"] }`
  - Path: `/workspace/src/foo.test.ts`
  - Expected: true (excluded)

- [ ] **TC-EF-06**: Handle missing .gitignore gracefully

  - No .gitignore in workspace
  - Expected: Only exclude node_modules and package deps

- [ ] **TC-EF-07**: Exclude nested node_modules

  - Path: `/workspace/packages/foo/node_modules/bar/index.js`
  - Expected: true (excluded)

- [ ] **TC-EF-08**: Cache .gitignore patterns

  - Check 10 files against .gitignore
  - Expected: .gitignore only read once

- [ ] **TC-EF-09**: Exclude build artifacts (dist, build)
  - Path: `/workspace/dist/index.js`
  - Expected: true (excluded by default)

### Component 4: Dependency Analyzer (`dependency-analyzer.ts`)

**Coverage Goal**: 90%+

- [ ] **TC-DA-01**: Analyze file with no dependencies

  - File: `const x = 1;`
  - Expected: Graph with 1 node, 0 edges

- [ ] **TC-DA-02**: Analyze file with 1 dependency

  - File A imports File B
  - Expected: Graph with 2 nodes, 1 edge (A→B)

- [ ] **TC-DA-03**: Analyze file with transitive dependency (depth 2)

  - File A imports B, B imports C
  - Expected: Graph with 3 nodes, depth 0, 1, 2

- [ ] **TC-DA-04**: Respect max depth limit

  - Chain: A→B→C→D→E (depth 4)
  - Max depth: 2
  - Expected: Graph only includes A, B, C

- [ ] **TC-DA-05**: Detect circular dependency

  - File A imports B, B imports A
  - Expected: Graph includes both, cycle detected

- [ ] **TC-DA-06**: Handle diamond dependency

  - A imports B and C, both B and C import D
  - Expected: D only appears once in graph

- [ ] **TC-DA-07**: Exclude node_modules dependencies

  - File imports `react` and `./utils`
  - Expected: Only `./utils` in graph

- [ ] **TC-DA-08**: Find test files

  - Source: `user-service.ts`
  - Test exists: `user-service.test.ts`
  - Expected: Test file in node's `testFiles` array

- [ ] **TC-DA-09**: Handle missing import gracefully

  - File imports `./nonexistent`
  - Expected: Skip import, continue analysis

- [ ] **TC-DA-10**: Analyze large file with 20+ imports

  - File with 25 imports
  - Expected: All imports analyzed, < 500ms

- [ ] **TC-DA-11**: Handle async errors during file read

  - Mock file read to throw error
  - Expected: Return partial graph, log error

- [ ] **TC-DA-12**: Build reverse dependency graph
  - A imports B, C imports B
  - Expected: reverseEdges[B] = {A, C}

### Component 5: Smart Selection Service (`smart-selection-service.ts`)

**Coverage Goal**: 85%+

- [ ] **TC-SS-01**: Auto-select dependencies when enabled

  - Config: enabled=true
  - User selects File A (imports B, C)
  - Expected: SelectionUpdate with added=[B, C]

- [ ] **TC-SS-02**: Don't auto-select when disabled

  - Config: enabled=false
  - User selects File A
  - Expected: SelectionUpdate with added=[]

- [ ] **TC-SS-03**: Clear auto-selections when root deselected

  - User deselects File A (had auto-selected B, C)
  - Expected: SelectionUpdate with removed=[B, C]

- [ ] **TC-SS-04**: Handle multiple root files

  - User selects A (imports B), then selects C (imports B)
  - Expected: B has selectedBy=[A, C], depth from nearest root

- [ ] **TC-SS-05**: Don't remove shared dependencies

  - User deselects A (B still needed by C)
  - Expected: B not removed

- [ ] **TC-SS-06**: Include test files in auto-selection

  - Config: includeTests=true
  - File A has test A.test.ts
  - Expected: Both A and A.test.ts selected

- [ ] **TC-SS-07**: Load config from VS Code settings

  - VS Code setting: maxDepth=3
  - Expected: Service uses maxDepth=3

- [ ] **TC-SS-08**: Handle analysis timeout
  - Mock analyzer to take 15s
  - Expected: Reject with timeout error after 10s

### Component 6: Graph Algorithms (`graph-algorithms.ts`)

**Coverage Goal**: 95%+

- [ ] **TC-GA-01**: BFS traversal visits all reachable nodes

  - Graph: A→B→C, A→D
  - Start: A
  - Expected: Visit order [A, B, D, C] or [A, D, B, C]

- [ ] **TC-GA-02**: BFS respects depth limit

  - Chain: A→B→C→D
  - Max depth: 2
  - Expected: Visit [A, B, C], not D

- [ ] **TC-GA-03**: Detect simple cycle (A→B→A)

  - Expected: Cycle [[A, B, A]]

- [ ] **TC-GA-04**: Detect complex cycle (A→B→C→A)

  - Expected: Cycle [[A, B, C, A]]

- [ ] **TC-GA-05**: Detect multiple cycles

  - A→B→A, C→D→C
  - Expected: 2 cycles detected

- [ ] **TC-GA-06**: Handle disconnected graph
  - Two separate components: A→B, C→D
  - Start: A
  - Expected: Only visit A, B

## Integration Tests

**How do we test component interactions?**

### Integration Scenario 1: End-to-End Dependency Analysis

- [ ] **TC-INT-01**: Select file in TypeScript project

  - Setup: Create sample TS project with A→B→C chain
  - Action: User selects A
  - Verify: B and C are auto-selected with correct metadata

- [ ] **TC-INT-02**: Select file in JavaScript project

  - Setup: Create sample JS project with CommonJS requires
  - Action: User selects entry file
  - Verify: All required files are auto-selected

- [ ] **TC-INT-03**: Select file in mixed TS/JS project
  - Setup: TS files import JS files
  - Action: User selects TS file
  - Verify: JS dependencies are included

### Integration Scenario 2: Exclusion Filtering

- [ ] **TC-INT-04**: Analyze project with node_modules

  - Setup: Project imports React and local files
  - Action: Analyze
  - Verify: React excluded, local files included

- [ ] **TC-INT-05**: Respect .gitignore
  - Setup: .gitignore contains `*.log`, project imports log file
  - Action: Analyze
  - Verify: Log file excluded

### Integration Scenario 3: Circular Dependencies

- [ ] **TC-INT-06**: Handle circular dependencies
  - Setup: A imports B, B imports A
  - Action: Select A
  - Verify: Both selected, cycle detected and logged

### Integration Scenario 4: Test File Discovery

- [ ] **TC-INT-07**: Auto-select test files
  - Setup: `user-service.ts` and `user-service.test.ts`
  - Action: Select `user-service.ts`
  - Verify: Test file auto-selected with type='auto-test'

### Integration Scenario 5: Message Passing

- [ ] **TC-INT-08**: Webview requests dependencies

  - Setup: Extension running, webview loaded
  - Action: Webview sends `getDependencies` message
  - Verify: Extension responds with `dependenciesResponse`

- [ ] **TC-INT-09**: Toggle smart selection from UI
  - Action: User clicks toggle in Settings
  - Verify: Extension updates config, sends confirmation

### Integration Scenario 6: Performance with Large Codebase

- [ ] **TC-INT-10**: Analyze file in 1000+ file project
  - Setup: Generate project with 1000 files
  - Action: Select file with 10 dependencies
  - Verify: Analysis completes in < 3s

### Integration Scenario 7: Path Resolution with tsconfig

- [ ] **TC-INT-11**: Resolve tsconfig path aliases
  - Setup: tsconfig with `@/*` alias
  - File imports `@/utils/helper`
  - Verify: Correctly resolves to `src/utils/helper.ts`

## End-to-End Tests

**What user flows need validation?**

### E2E Flow 1: Enable Smart Selection and Select File

- [ ] **TC-E2E-01**: Complete workflow from toggle to context generation
  1. User opens Context Tab
  2. User navigates to Settings Tab
  3. User enables Smart Selection
  4. User returns to Context Tab
  5. User clicks on a source file
  6. Extension analyzes dependencies
  7. Dependent files are highlighted as auto-selected
  8. User generates context
  9. XML includes all selected files
  - Verify: All steps work seamlessly, correct files in context

### E2E Flow 2: Deselect Root File

- [ ] **TC-E2E-02**: Deselect root and verify auto-selections removed
  1. User selects File A (auto-selects B, C)
  2. User deselects File A
  3. Verify: B and C are deselected (if not needed by other roots)

### E2E Flow 3: Configure Max Depth

- [ ] **TC-E2E-03**: Change max depth setting
  1. User sets max depth to 2
  2. User selects file with 4-level deep chain
  3. Verify: Only first 2 levels selected

### E2E Flow 4: Disable Smart Selection

- [ ] **TC-E2E-04**: Disable smart selection mid-session
  1. User selects File A with smart selection enabled
  2. B and C auto-selected
  3. User disables smart selection
  4. User selects File D
  5. Verify: No auto-selection for D, A/B/C remain selected

### E2E Flow 5: Handle Errors Gracefully

- [ ] **TC-E2E-05**: Analysis fails for one file
  1. Mock one file to throw error during parsing
  2. User selects file that imports failing file
  3. Verify: Error logged, other files still analyzed, user notified

## Test Data

**What data do we use for testing?**

### Test Fixtures

#### Fixture 1: Simple TypeScript Project

```
fixtures/simple-ts/
├── src/
│   ├── index.ts         # imports utils
│   ├── utils.ts         # no imports
│   └── index.test.ts    # test file
└── tsconfig.json
```

#### Fixture 2: Complex Dependency Chain

```
fixtures/complex-deps/
├── src/
│   ├── A.ts  # imports B, C
│   ├── B.ts  # imports D
│   ├── C.ts  # imports D
│   └── D.ts  # no imports
```

#### Fixture 3: Circular Dependencies

```
fixtures/circular/
├── src/
│   ├── A.ts  # imports B
│   └── B.ts  # imports A
```

#### Fixture 4: Project with node_modules

```
fixtures/with-node-modules/
├── src/
│   └── index.ts  # imports react and ./utils
├── node_modules/
│   └── react/
└── package.json
```

#### Fixture 5: Monorepo Structure

```
fixtures/monorepo/
├── packages/
│   ├── app/
│   │   └── src/index.ts  # imports @internal/utils
│   └── utils/
│       └── src/index.ts
└── tsconfig.json  # with path mappings
```

### Mocks

#### Mock 1: VS Code APIs

```typescript
const mockWorkspaceFs = {
  readFile: jest.fn(),
  stat: jest.fn(),
};

const mockWorkspace = {
  fs: mockWorkspaceFs,
  getConfiguration: jest.fn(),
  findFiles: jest.fn(),
};
```

#### Mock 2: File System

```typescript
const mockFileContent = new Map<string, string>([
  ["/workspace/src/A.ts", 'import B from "./B"'],
  ["/workspace/src/B.ts", "export default {}"],
]);
```

## Test Reporting & Coverage

**How do we verify and communicate test results?**

### Coverage Commands

```bash
# Run all tests with coverage
pnpm run test -- --coverage

# Run specific test suite
pnpm run test import-parser.test.ts

# Watch mode during development
pnpm run test -- --watch

# Generate HTML coverage report
pnpm run test -- --coverage --coverageReporters=html
```

### Coverage Thresholds

Set in `jest.config.js` or `vitest.config.ts`:

```javascript
coverage: {
  branches: 80,
  functions: 85,
  lines: 85,
  statements: 85
}
```

### Coverage Gaps

Document any files/functions below 100% with rationale:

- **Import Parser regex edge cases**: 95% coverage (some regex edge cases hard to test)
- **Error handling paths**: 90% coverage (some error conditions hard to simulate)
- **Cache invalidation**: 85% coverage (time-based cache expiry hard to test)

### Test Reports

- Jest/Vitest generates `coverage/` directory with HTML report
- CI/CD pipeline runs tests on every commit
- Coverage badge in README.md
- Test results posted to PR comments

## Manual Testing

**What requires human validation?**

### UI/UX Testing Checklist

- [ ] **MT-UI-01**: Smart Selection toggle is visible and clear
- [ ] **MT-UI-02**: Auto-selected files have distinct visual indicator
- [ ] **MT-UI-03**: Tooltips explain why file was auto-selected
- [ ] **MT-UI-04**: Settings panel is intuitive and well-organized
- [ ] **MT-UI-05**: Progress indicator shows for long operations
- [ ] **MT-UI-06**: Error messages are user-friendly
- [ ] **MT-UI-07**: Keyboard navigation works (tab, enter, space)
- [ ] **MT-UI-08**: Screen reader announces selections (accessibility)
- [ ] **MT-UI-09**: Works with VS Code light theme
- [ ] **MT-UI-10**: Works with VS Code dark theme
- [ ] **MT-UI-11**: Works with high contrast themes

### Browser/Device Compatibility

- N/A (VS Code extension, not browser-based)

### Smoke Tests After Build

- [ ] Extension loads without errors
- [ ] Context Tab renders correctly
- [ ] Settings Tab renders correctly
- [ ] Smart Selection can be toggled
- [ ] Basic file selection works
- [ ] Context generation works

## Performance Testing

**How do we validate performance?**

### Load Testing Scenarios

- [ ] **PT-01**: Small project (< 50 files)

  - Select file with 5 dependencies
  - Expected: < 100ms analysis time

- [ ] **PT-02**: Medium project (100-500 files)

  - Select file with 15 dependencies
  - Expected: < 500ms analysis time (P95)

- [ ] **PT-03**: Large project (1000+ files)

  - Select file with 30 dependencies, depth 5
  - Expected: < 3s analysis time (P99)

- [ ] **PT-04**: Very deep dependency chain
  - 10 levels deep
  - Expected: < 5s with max depth=10

### Stress Testing Approach

- [ ] **PT-05**: Rapid file selections

  - User clicks 10 files rapidly
  - Expected: All analyses complete, no race conditions

- [ ] **PT-06**: Very large dependency graph
  - Select root that transitively imports 200+ files
  - Expected: Warning shown, user can cancel, < 10s

### Performance Benchmarks

Target metrics (documented in design):

- **P50**: < 200ms for typical files (< 10 deps)
- **P95**: < 500ms for complex files (< 20 deps)
- **P99**: < 3s for very complex files (< 50 deps)

Benchmark script:

```typescript
async function benchmark(projectPath: string, filePath: string) {
  const start = performance.now();
  await smartSelectionService.analyzeDependencies(filePath, config);
  const duration = performance.now() - start;
  console.log(`Analysis time: ${duration.toFixed(2)}ms`);
  return duration;
}
```

## Bug Tracking

**How do we manage issues?**

### Issue Tracking Process

1. User reports bug via GitHub Issues
2. Triage: Assign severity (P0-P3) and priority
3. Reproduce: Add reproduction steps to issue
4. Fix: Create branch, implement fix, add regression test
5. Review: Code review, verify fix works
6. Release: Include in next version, update CHANGELOG

### Bug Severity Levels

- **P0 (Critical)**: Extension crashes, data loss
- **P1 (High)**: Feature broken, major functionality affected
- **P2 (Medium)**: Feature partially broken, workaround exists
- **P3 (Low)**: Minor issue, cosmetic, edge case

### Regression Testing Strategy

- Add test case for every bug fix
- Run full test suite before each release
- Maintain test fixture library for reported issues
- Document known issues in README if unfixable
