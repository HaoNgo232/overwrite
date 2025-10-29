import * as vscode from 'vscode'

/**
 * Represents a single import statement found in a file
 */
export interface ImportStatement {
	/** Import path as written in code (e.g., './utils', '@/components') */
	source: string

	/** Type of import statement */
	type: 'es6' | 'commonjs' | 'dynamic'

	/** What's being imported (named imports, default, etc.) */
	specifiers: string[]

	/** Line number where import was found (1-indexed) */
	line: number
}

/**
 * Service for parsing import statements from TypeScript/JavaScript files
 *
 * Supports:
 * - ES6 imports: import { foo } from './bar'
 * - CommonJS: const foo = require('./bar')
 * - Dynamic imports: import('./bar')
 *
 * Edge cases handled:
 * - Multi-line imports
 * - Comments (ignored)
 * - String literals with "import"/"require" (ignored)
 */
export class ImportParser {
	private static readonly ES6_IMPORT_REGEX =
		/import\s+(?:(?:[\w*\s{},]*)\s+from\s+)?['"]([^'"]+)['"]/g

	private static readonly COMMONJS_REQUIRE_REGEX =
		/(?:const|let|var|import)\s+.*?=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

	private static readonly DYNAMIC_IMPORT_REGEX =
		/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

	/**
	 * Parse import statements from a file
	 *
	 * @param filePath Absolute path to the file to parse
	 * @returns Array of import statements found
	 */
	async parseImports(filePath: string): Promise<ImportStatement[]> {
		try {
			// Check if file type is supported
			if (!this.isSupportedFile(filePath)) {
				return []
			}

			// Read file contents
			const uri = vscode.Uri.file(filePath)
			const fileBytes = await vscode.workspace.fs.readFile(uri)
			const content = Buffer.from(fileBytes).toString('utf8')

			// Parse imports
			return this.parseImportsFromContent(content)
		} catch (error) {
			console.error(`[ImportParser] Failed to parse ${filePath}:`, error)
			return []
		}
	}

	/**
	 * Parse imports from file content string
	 *
	 * @param content File content as string
	 * @returns Array of import statements
	 */
	parseImportsFromContent(content: string): ImportStatement[] {
		const imports: ImportStatement[] = []

		// Remove comments to avoid false positives
		const contentWithoutComments = this.removeComments(content)

		// Parse ES6 imports
		const es6Imports = this.parseES6Imports(contentWithoutComments)
		imports.push(...es6Imports)

		// Parse CommonJS requires
		const cjsImports = this.parseCommonJSImports(contentWithoutComments)
		imports.push(...cjsImports)

		// Parse dynamic imports
		const dynamicImports = this.parseDynamicImports(contentWithoutComments)
		imports.push(...dynamicImports)

		return imports
	}

	/**
	 * Check if file type is supported for parsing
	 */
	isSupportedFile(filePath: string): boolean {
		const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
		return supportedExtensions.some((ext) => filePath.endsWith(ext))
	}

	/**
	 * Remove single-line and multi-line comments
	 */
	private removeComments(content: string): string {
		// Remove single-line comments
		let result = content.replaceAll(/\/\/.*$/gm, '')

		// Remove multi-line comments
		result = result.replaceAll(/\/\*[\s\S]*?\*\//g, '')

		return result
	}

	/**
	 * Parse ES6 import statements
	 */
	private parseES6Imports(content: string): ImportStatement[] {
		const imports: ImportStatement[] = []
		const lines = content.split('\n')

		// Reset regex state
		ImportParser.ES6_IMPORT_REGEX.lastIndex = 0

		let match = ImportParser.ES6_IMPORT_REGEX.exec(content)
		while (match !== null) {
			const source = match[1]
			const lineNumber = this.getLineNumber(content, match.index)

			// Extract specifiers (what's being imported)
			const importLine = lines[lineNumber - 1]
			const specifiers = this.extractES6Specifiers(importLine)

			imports.push({
				source,
				type: 'es6',
				specifiers,
				line: lineNumber,
			})

			match = ImportParser.ES6_IMPORT_REGEX.exec(content)
		}

		return imports
	}

	/**
	 * Parse CommonJS require statements
	 */
	private parseCommonJSImports(content: string): ImportStatement[] {
		const imports: ImportStatement[] = []

		// Reset regex state
		ImportParser.COMMONJS_REQUIRE_REGEX.lastIndex = 0

		let match = ImportParser.COMMONJS_REQUIRE_REGEX.exec(content)
		while (match !== null) {
			const source = match[1]
			const lineNumber = this.getLineNumber(content, match.index)

			imports.push({
				source,
				type: 'commonjs',
				specifiers: [], // CommonJS doesn't have explicit specifiers in require()
				line: lineNumber,
			})

			match = ImportParser.COMMONJS_REQUIRE_REGEX.exec(content)
		}

		return imports
	}

	/**
	 * Parse dynamic import() statements
	 */
	private parseDynamicImports(content: string): ImportStatement[] {
		const imports: ImportStatement[] = []

		// Reset regex state
		ImportParser.DYNAMIC_IMPORT_REGEX.lastIndex = 0

		let match = ImportParser.DYNAMIC_IMPORT_REGEX.exec(content)
		while (match !== null) {
			const source = match[1]
			const lineNumber = this.getLineNumber(content, match.index)

			imports.push({
				source,
				type: 'dynamic',
				specifiers: [],
				line: lineNumber,
			})

			match = ImportParser.DYNAMIC_IMPORT_REGEX.exec(content)
		}

		return imports
	}

	/**
	 * Extract what's being imported from ES6 import statement
	 */
	private extractES6Specifiers(importLine: string): string[] {
		const specifiers: string[] = []

		// Default import: import Foo from '...'
		const defaultRegex = /import\s+(\w+)\s+from/
		const defaultMatch = defaultRegex.exec(importLine)
		if (defaultMatch) {
			specifiers.push(defaultMatch[1])
		}

		// Named imports: import { foo, bar } from '...'
		const namedRegex = /import\s*\{([^}]+)\}/
		const namedMatch = namedRegex.exec(importLine)
		if (namedMatch) {
			const named = namedMatch[1]
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0)
			specifiers.push(...named)
		}

		// Namespace import: import * as Foo from '...'
		const namespaceRegex = /import\s+\*\s+as\s+(\w+)/
		const namespaceMatch = namespaceRegex.exec(importLine)
		if (namespaceMatch) {
			specifiers.push(`* as ${namespaceMatch[1]}`)
		}

		return specifiers
	}

	/**
	 * Get line number from character index in content
	 */
	private getLineNumber(content: string, index: number): number {
		const lines = content.substring(0, index).split('\n')
		return lines.length
	}
}
