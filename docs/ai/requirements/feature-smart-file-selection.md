---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: smart-file-selection
status: approved
last_updated: 2025-10-29
---

# Requirements & Problem Understanding

## 📋 Executive Summary

**Feature**: Smart File Selection - Tự động chọn các file liên quan  
**Goal**: Giảm thời gian chọn file từ 5-15 phút → vài giây, tối ưu context cho LLM  
**Scope**: Auto-select imported dependencies (depth 5), test files, config files  
**Out of Scope**: Reverse dependencies, runtime analysis, semantic code understanding

**Key Decisions (Confirmed):**

- ✅ Default max depth: **5 levels** (configurable 0-20)
- ✅ Include scoped packages trong workspace (`@company/shared`)
- ✅ Include config files (`tsconfig.json`, `package.json`)
- ✅ Progress bar với file count UI
- ✅ NO reverse dependencies (chỉ forward deps)

**Success Metrics:**

- ⚡ Analysis < 500ms (P95), < 3s (P99)
- 🎯 85%+ test coverage
- 🚀 Reduce manual file selection time by 80%+

---

## Problem Statement

**What problem are we solving?**

- **Core Problem**: Khi làm việc với codebase lớn, developers phải tốn nhiều thời gian để thủ công tìm và chọn các file liên quan (imported files, test files, dependencies) để tạo context đầy đủ cho LLM. Việc này không chỉ tốn thời gian mà còn dễ bỏ sót các file quan trọng, dẫn đến context không đầy đủ.

- **Who is affected**: Developers sử dụng Overwrite extension để pack context cho LLM, đặc biệt là những người làm việc với:

  - Codebase lớn với nhiều file phụ thuộc lẫn nhau
  - Dự án có cấu trúc phức tạp với nhiều module/layer
  - Code có nhiều import/export relationships

- **Current situation/workaround**: Hiện tại users phải:
  - Manually mở từng file để xem nó import file nào
  - Tìm kiếm test files tương ứng bằng tay
  - Nhớ và track các dependencies để không bỏ sót
  - Có thể tốn 5-15 phút chỉ để chọn đúng các file cần thiết
  - Hoặc chọn quá nhiều file (bao gồm cả node_modules) làm context quá lớn

## Goals & Objectives

**What do we want to achieve?**

### Primary Goals

- **Tối ưu hóa context**: Tự động chọn đủ các file liên quan để có context đầy đủ mà không redundant
- **Tiết kiệm thời gian**: Giảm thời gian chọn file từ 5-15 phút xuống còn vài giây
- **Giảm sai sót**: Tránh bỏ sót các file quan trọng trong dependency chain

### Secondary Goals

- Cải thiện UX của Context Tab với smart suggestions
- Hỗ trợ developers hiểu rõ hơn về dependency structure của codebase
- Tăng độ chính xác của AI responses nhờ context đầy đủ hơn

### Non-Goals (Out of Scope)

- ❌ Không phân tích semantic code để hiểu logic (chỉ phân tích import statements)
- ❌ Không resolve runtime dependencies (chỉ static imports)
- ❌ Không refactor code structure
- ❌ Không tối ưu hóa code trong các file được chọn

## User Stories & Use Cases

**How will users interact with the solution?**

### User Stories

**US-1: Auto-select imported dependencies**

- **As a** developer working on a large codebase
- **I want to** automatically select all files that my selected file imports
- **So that** the LLM has full context of dependencies without me manually tracking imports

**US-2: Include test files automatically**

- **As a** developer debugging or refactoring code
- **I want to** automatically include corresponding test files when I select a source file
- **So that** the LLM understands both implementation and expected behavior

**US-3: Exclude third-party libraries**

- **As a** developer with limited context window
- **I want to** automatically exclude node_modules and third-party libraries from selection
- **So that** I don't waste tokens on library code that LLM already knows

**US-4: Recursive dependency resolution**

- **As a** developer working on interconnected modules
- **I want to** automatically follow the entire dependency chain (A imports B imports C)
- **So that** I have complete context of all related code

**US-5: Toggle smart selection mode**

- **As a** developer who sometimes wants manual control
- **I want to** toggle smart selection on/off
- **So that** I can choose between automatic and manual file selection

**US-6: Exclude gitignored files**

- **As a** developer with build artifacts and temp files
- **I want to** automatically exclude files in .gitignore
- **So that** only source code is included in context

### Key Workflows

#### Workflow 1: Basic Smart Selection

1. User opens Context Tab
2. User enables "Smart Selection" mode
3. User clicks on a single source file (e.g., `user-service.ts`)
4. Extension automatically:
   - Analyzes imports in `user-service.ts`
   - Selects imported files (e.g., `user-model.ts`, `database.ts`)
   - Finds and selects test file (`user-service.test.ts`)
   - Recursively analyzes imports in selected files
   - Excludes node_modules and third-party deps
   - Highlights newly selected files in the tree
5. User reviews auto-selected files
6. User can manually deselect unwanted files if needed
7. User generates context with all selected files

#### Workflow 2: Deep Dependency Analysis

1. User selects a root component file
2. Smart selection traverses entire dependency graph:
   - Level 1: Direct imports
   - Level 2: Imports of imports
   - Level N: Until no new files found or circular deps detected
3. User sees visual indication of depth levels
4. User can adjust max depth in settings

### Edge Cases to Consider

1. **Circular Dependencies**: A imports B, B imports A

   - Should detect and handle gracefully (select both, don't infinite loop)

2. **Dynamic Imports**: `import()` or `require()` with variables

   - May not be statically analyzable, log warning or skip

3. **Barrel Exports**: `index.ts` that re-exports many files

   - Should follow through to actual implementations

4. **Monorepo with Multiple Packages**:

   - Should respect package boundaries
   - May need to handle `@internal/package-name` imports

5. **Mixed Import Styles**: ES6 imports, CommonJS require, TypeScript path aliases

   - Need to support all common import patterns

6. **Very Large Dependency Chains**: Selecting 1 file leads to 100+ files
   - Need max depth limit or user confirmation
   - Show progress indicator for large operations

## Success Criteria

**How will we know when we're done?**

### Functional Criteria

- ✅ User can toggle Smart Selection mode on/off in Settings Tab
- ✅ When enabled, clicking a file auto-selects its dependencies
- ✅ Test files matching patterns (`.test.ts`, `.spec.ts`, `__tests__/`) are auto-selected
- ✅ Files in node_modules are excluded
- ✅ Files in .gitignore are excluded
- ✅ Dependencies listed in package.json are excluded
- ✅ Recursive dependency resolution works up to configurable depth
- ✅ Circular dependencies are detected and handled
- ✅ Auto-selected files are visually distinguishable from manual selections

### Performance Criteria

- ⚡ Dependency analysis completes in < 500ms for files with < 20 imports
- ⚡ Large dependency chains (50+ files) complete in < 3 seconds
- ⚡ UI remains responsive during analysis
- ⚡ Progress indicator shows for operations > 1 second

### UX Criteria

- 🎨 Clear visual feedback when Smart Selection is active
- 🎨 Users can see which files were auto-selected vs manual
- 🎨 Users can easily deselect auto-selected files
- 🎨 Clear messaging when dependencies can't be resolved
- 🎨 Settings are persistent across sessions

### Quality Criteria

- 🧪 85%+ test coverage for dependency resolution logic
- 🧪 Handles all common import patterns (ES6, CommonJS, TypeScript)
- 🧪 Works with TypeScript path aliases and webpack aliases
- 🧪 No false positives (selecting irrelevant files)
- 🧪 Minimal false negatives (missing relevant files)

## Constraints & Assumptions

**What limitations do we need to work within?**

### Technical Constraints

- **Parser Limitations**: May need AST parsing or regex for import detection
- **VS Code API Limits**: Must use VS Code workspace APIs for file reading
- **Performance**: Large codebases (1000+ files) need efficient algorithms
- **File System**: Async file reads may impact performance
- **Import Resolution**: Must respect tsconfig paths, webpack aliases, etc.

### Assumptions

- ✓ Codebase uses standard import conventions (ES6/CommonJS)
- ✓ Test files follow common naming patterns
- ✓ package.json exists for third-party detection
- ✓ .gitignore exists and is properly configured
- ✓ Users have reasonable expectation of depth (not selecting entire codebase from one file)
- ✓ Most dependency chains are < 5 levels deep
- ✓ File system is accessible and readable by extension

### Business Constraints

- Must work with existing Context Tab architecture
- Should not break existing manual selection workflow
- Must respect user's workspace settings (exclude patterns, etc.)

## Questions & Open Items

**What do we still need to clarify?**

### ✅ Resolved Decisions

Các quyết định đã được xác nhận với stakeholder:

1. **Max Depth Default**: ✅ **CONFIRMED**

   - Default: **5 levels**
   - User configurable in settings (0 = unlimited, max = 20)
   - Provides good balance between context completeness and performance

2. **Reverse Dependencies**: ✅ **CONFIRMED - NOT IMPLEMENTED**

   - **Decision**: Do NOT auto-select files that import the selected file
   - **Rationale**: Users want to understand dependencies OF the file, not WHO uses it
   - Keeps feature simple and predictable
   - Example: Select `database.ts` → only select what IT imports, not who imports it

3. **Scoped Packages in Monorepo**: ✅ **CONFIRMED - INCLUDE**

   - **Decision**: Auto-select scoped packages like `@company/shared`, `@internal/utils` if they are in workspace
   - **Implementation**: Check if resolved path is within workspace boundaries
   - Exclude only true external packages (node_modules)
   - Critical for monorepo workflows

4. **Configuration Files**: ✅ **CONFIRMED - INCLUDE**

   - **Decision**: Auto-select `tsconfig.json`, `package.json` when imported/referenced
   - **Rationale**: Important for context, minimal token cost
   - Also include other config files that are explicitly imported (e.g., `.eslintrc.js`)

5. **Progress Feedback**: ✅ **CONFIRMED**

   - **Decision**: Progress bar with count display
   - Format: "Analyzing dependencies... 45/120 files"
   - Shows for operations > 1 second
   - Includes cancel button for very long operations

6. **UI Placement**: ✅ **CONFIRMED - DUAL LOCATION**
   - Settings Tab: Full configuration (max depth, patterns, exclusions)
   - Context Tab: Quick toggle button for enable/disable
   - Provides both detailed control and quick access

### Remaining Open Items

**Low Priority - Can be decided during implementation:**

1. **File Type Extensions**:

   - Should we auto-select `.css`, `.scss`, `.less` when imported?
   - Should we auto-select `.json` data files (non-config)?
   - **Suggested approach**: Include all imported files regardless of type, let exclusion filter handle unwanted types

2. **Circular Dependency Notification**:

   - Should we show a notification when circular deps detected?
   - Or just log silently?
   - **Suggested approach**: Log to console, show subtle indicator in UI

3. **Large Graph Warning Threshold**:
   - At what file count should we warn user?
   - 100 files? 200 files? 500 files?
   - **Suggested approach**: Warn at 200 files, require confirmation

### Research & Investigation

Items to explore during implementation:

- **Import Parser**: Evaluate `@typescript-eslint/typescript-estree` vs custom regex (prototype both)
- **Performance Benchmarks**: Test with large real-world codebases (VS Code, React, Angular repos)
- **TypeScript Compiler API**: Investigate `ts.resolveModuleName()` for accurate path resolution
- **Circular Dependency Detection**: Implement Tarjan's algorithm or DFS-based cycle detection
