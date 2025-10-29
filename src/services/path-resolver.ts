import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Configuration for path resolution
 */
export interface PathResolverConfig {
  /** Workspace root directory */
  workspaceRoot: string;

  /** TypeScript path mappings from tsconfig.json */
  pathMappings?: Map<string, string[]>;

  /** Base URL from tsconfig.json */
  baseUrl?: string;
}

/**
 * Service for resolving import paths to absolute workspace paths
 *
 * Supports:
 * - Relative imports: ./file, ../file
 * - TypeScript path aliases: @/components, @internal/utils
 * - Barrel exports: ./components → ./components/index.ts
 * - Multiple file extensions: .ts, .tsx, .js, .jsx
 *
 * Features:
 * - Caches tsconfig.json for performance
 * - Handles missing files gracefully
 * - Respects workspace boundaries
 */
export class PathResolver {
  private readonly config: PathResolverConfig;
  private tsconfigCache: Map<string, unknown> | null = null;

  /** File extensions to try when resolving imports (in order) */
  private static readonly EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
  ];

  /** Barrel export file names to try */
  private static readonly BARREL_FILES = [
    "index.ts",
    "index.tsx",
    "index.js",
    "index.jsx",
  ];

  constructor(workspaceRoot: string) {
    this.config = {
      workspaceRoot,
    };
  }

  /**
   * Resolve an import path to an absolute workspace path
   *
   * @param importPath Import path as written in code (e.g., './utils', '@/components')
   * @param currentFilePath Absolute path of the file containing the import
   * @returns Absolute path to the imported file, or null if not found
   */
  async resolve(
    importPath: string,
    currentFilePath: string,
  ): Promise<string | null> {
    try {
      // Skip node_modules imports (external packages)
      if (this.isExternalPackage(importPath)) {
        return null;
      }

      // Load tsconfig if not already loaded
      await this.ensureTsconfigLoaded();

      // Try different resolution strategies
      let resolvedPath: string | null = null;

      // 1. Try tsconfig path mappings
      if (this.config.pathMappings) {
        resolvedPath = await this.resolveTsconfigPath(importPath);
        if (resolvedPath) {
          return resolvedPath;
        }
      }

      // 2. Try relative path resolution
      resolvedPath = await this.resolveRelativePath(
        importPath,
        currentFilePath,
      );
      if (resolvedPath) {
        return resolvedPath;
      }

      // 3. Try baseUrl resolution (if configured)
      if (this.config.baseUrl) {
        resolvedPath = await this.resolveBaseUrlPath(importPath);
        if (resolvedPath) {
          return resolvedPath;
        }
      }

      return null;
    } catch (error) {
      console.warn(
        `[PathResolver] Failed to resolve "${importPath}" in ${currentFilePath}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Check if import path is an external package (node_modules)
   */
  private isExternalPackage(importPath: string): boolean {
    // External packages don't start with . or /
    // Examples: 'react', '@company/package', 'lodash'
    return !importPath.startsWith(".") && !importPath.startsWith("/");
  }

  /**
   * Resolve relative import path
   */
  private async resolveRelativePath(
    importPath: string,
    currentFilePath: string,
  ): Promise<string | null> {
    const currentDir = path.dirname(currentFilePath);
    const absolutePath = path.resolve(currentDir, importPath);

    // Try to find file with various strategies
    return await this.findFile(absolutePath);
  }

  /**
   * Resolve import using tsconfig path mappings
   */
  private async resolveTsconfigPath(
    importPath: string,
  ): Promise<string | null> {
    if (!this.config.pathMappings) {
      return null;
    }

    // Try each path mapping pattern
    for (const [pattern, paths] of this.config.pathMappings.entries()) {
      // Convert glob pattern to regex
      // Example: "@/*" → "^@/(.*)$"
      const regexPattern = pattern.replaceAll("*", "(.*)");
      const regex = new RegExp(`^${regexPattern}$`);

      const match = regex.exec(importPath);
      if (match) {
        // Extract the matched part (after the prefix)
        const matchedPart = match[1] || "";

        // Try each mapped path
        for (const mappedPath of paths) {
          // Replace * with matched part
          const resolvedPattern = mappedPath.replaceAll("*", matchedPart);
          const absolutePath = path.join(
            this.config.workspaceRoot,
            this.config.baseUrl || "",
            resolvedPattern,
          );

          const foundPath = await this.findFile(absolutePath);
          if (foundPath) {
            return foundPath;
          }
        }
      }
    }

    return null;
  }

  /**
   * Resolve import using baseUrl
   */
  private async resolveBaseUrlPath(importPath: string): Promise<string | null> {
    if (!this.config.baseUrl) {
      return null;
    }

    const absolutePath = path.join(
      this.config.workspaceRoot,
      this.config.baseUrl,
      importPath,
    );

    return await this.findFile(absolutePath);
  }

  /**
   * Find a file by trying various extensions and barrel exports
   *
   * @param basePath Base path without extension
   * @returns Absolute path if found, null otherwise
   */
  private async findFile(basePath: string): Promise<string | null> {
    // 1. Try exact path first (if it has extension)
    if (path.extname(basePath)) {
      if (await this.fileExists(basePath)) {
        return basePath;
      }
    }

    // 2. Try adding extensions
    for (const ext of PathResolver.EXTENSIONS) {
      const pathWithExt = `${basePath}${ext}`;
      if (await this.fileExists(pathWithExt)) {
        return pathWithExt;
      }
    }

    // 3. Try barrel exports (index files)
    for (const barrelFile of PathResolver.BARREL_FILES) {
      const barrelPath = path.join(basePath, barrelFile);
      if (await this.fileExists(barrelPath)) {
        return barrelPath;
      }
    }

    return null;
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load tsconfig.json and extract path mappings
   */
  private async ensureTsconfigLoaded(): Promise<void> {
    if (this.tsconfigCache !== null) {
      return; // Already loaded
    }

    try {
      const tsconfigPath = path.join(
        this.config.workspaceRoot,
        "tsconfig.json",
      );
      const uri = vscode.Uri.file(tsconfigPath);

      // Check if tsconfig.json exists
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        // No tsconfig.json, that's okay
        this.tsconfigCache = new Map();
        return;
      }

      // Read and parse tsconfig.json
      const fileBytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(fileBytes).toString("utf8");

      // Remove comments from JSON (TypeScript allows comments in tsconfig)
      const cleanContent = this.removeJsonComments(content);
      const tsconfig = JSON.parse(cleanContent);

      // Extract compiler options
      const compilerOptions = tsconfig.compilerOptions || {};
      this.config.baseUrl = compilerOptions.baseUrl;

      // Extract path mappings
      if (compilerOptions.paths) {
        this.config.pathMappings = new Map(
          Object.entries(compilerOptions.paths),
        );
      }

      this.tsconfigCache = new Map();
      console.log(
        `[PathResolver] Loaded tsconfig.json: baseUrl=${
          this.config.baseUrl
        }, paths=${this.config.pathMappings?.size || 0}`,
      );
    } catch (error) {
      console.warn("[PathResolver] Failed to load tsconfig.json:", error);
      this.tsconfigCache = new Map();
    }
  }

  /**
   * Remove comments from JSON string
   */
  private removeJsonComments(json: string): string {
    // Remove single-line comments
    let result = json.replaceAll(/\/\/.*$/gm, "");

    // Remove multi-line comments
    result = result.replaceAll(/\/\*[\s\S]*?\*\//g, "");

    return result;
  }

  /**
   * Clear cached tsconfig (useful for testing or when tsconfig changes)
   */
  clearCache(): void {
    this.tsconfigCache = null;
    this.config.pathMappings = undefined;
    this.config.baseUrl = undefined;
  }
}
