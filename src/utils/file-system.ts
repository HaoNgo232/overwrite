import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path' // Still needed for path.relative and path.join for ignore patterns
import ignore from 'ignore'
import * as vscode from 'vscode'
import type { VscodeTreeItem } from '../types'

// Comprehensive list of binary file extensions
const BINARY_EXTENSIONS = new Set([
	// Images
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.bmp',
	'.tiff',
	'.tif',
	'.webp',
	'.svg',
	'.ico',
	'.heic',
	'.avif',
	// Videos
	'.mp4',
	'.avi',
	'.mov',
	'.mkv',
	'.wmv',
	'.flv',
	'.webm',
	'.m4v',
	'.3gp',
	'.ogv',
	// Audio
	'.mp3',
	'.wav',
	'.flac',
	'.aac',
	'.ogg',
	'.wma',
	'.m4a',
	'.opus',
	'.oga',
	// Archives
	'.zip',
	'.rar',
	'.7z',
	'.tar',
	'.gz',
	'.bz2',
	'.xz',
	'.lzma',
	'.cab',
	'.dmg',
	'.iso',
	// Executables
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.app',
	'.deb',
	'.rpm',
	'.msi',
	'.pkg',
	// Documents
	'.pdf',
	'.doc',
	'.docx',
	'.xls',
	'.xlsx',
	'.ppt',
	'.pptx',
	'.odt',
	'.ods',
	'.odp',
	// Fonts
	'.ttf',
	'.otf',
	'.woff',
	'.woff2',
	'.eot',
	// Other binary formats
	'.bin',
	'.dat',
	'.db',
	'.sqlite',
	'.sqlite3',
	'.class',
	'.pyc',
	'.o',
	'.obj',
])

// Magic number signatures for common binary formats
const MAGIC_NUMBERS = [
	{ signature: [0xff, 0xd8, 0xff], format: 'JPEG' },
	{ signature: [0x89, 0x50, 0x4e, 0x47], format: 'PNG' },
	{ signature: [0x47, 0x49, 0x46, 0x38], format: 'GIF' },
	{ signature: [0x25, 0x50, 0x44, 0x46], format: 'PDF' },
	{ signature: [0x50, 0x4b, 0x03, 0x04], format: 'ZIP' },
	{ signature: [0x50, 0x4b, 0x05, 0x06], format: 'ZIP (empty)' },
	{ signature: [0x7f, 0x45, 0x4c, 0x46], format: 'ELF' },
	{ signature: [0x4d, 0x5a], format: 'PE/EXE' },
	{ signature: [0xca, 0xfe, 0xba, 0xbe], format: 'Mach-O' },
]

function checkMagicNumbers(chunk: Uint8Array): boolean {
	for (const { signature } of MAGIC_NUMBERS) {
		if (chunk.length >= signature.length) {
			let matches = true
			for (let i = 0; i < signature.length; i++) {
				if (chunk[i] !== signature[i]) {
					matches = false
					break
				}
			}
			if (matches) return true
		}
	}
	return false
}

function analyzeByteContent(chunk: Uint8Array): boolean {
	if (chunk.length === 0) return false

	let nonPrintableCount = 0
	let nullByteCount = 0

	for (const byte of chunk) {
		// Count null bytes
		if (byte === 0) {
			nullByteCount++
		}
		// Count non-printable characters (excluding common whitespace)
		else if (
			byte < 32 &&
			byte !== 9 && // tab
			byte !== 10 && // LF
			byte !== 12 && // FF
			byte !== 13 // CR
		) {
			nonPrintableCount++
		}
	}

	// If more than 1% null bytes, likely binary
	if (nullByteCount > chunk.length * 0.01) {
		return true
	}

	// If more than 30% non-printable characters, likely binary
	if (nonPrintableCount > chunk.length * 0.3) {
		return true
	}

	return false
}

export function looksBinary(chunk: Uint8Array): boolean {
	// First check magic numbers (most reliable)
	if (checkMagicNumbers(chunk)) {
		return true
	}

	// Do not treat common text encodings as binary (even if they contain null bytes).
	// UTF-8 BOM: EF BB BF
	if (
		chunk.length >= 3 &&
		chunk[0] === 0xef &&
		chunk[1] === 0xbb &&
		chunk[2] === 0xbf
	) {
		return false
	}

	// UTF-16 BOMs: FF FE (LE) or FE FF (BE)
	if (chunk.length >= 2) {
		const b0 = chunk[0]
		const b1 = chunk[1]
		if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) {
			return false
		}
	}

	// Heuristic: UTF-16 text often has NUL bytes in either even or odd positions.
	// If NULs are concentrated in one parity, treat as text (not binary).
	if (chunk.length >= 16) {
		let evenZeros = 0
		let oddZeros = 0
		let evenCount = 0
		let oddCount = 0

		for (let i = 0; i < chunk.length; i++) {
			if (i % 2 === 0) {
				evenCount++
				if (chunk[i] === 0) evenZeros++
			} else {
				oddCount++
				if (chunk[i] === 0) oddZeros++
			}
		}

		const evenZeroRatio = evenCount > 0 ? evenZeros / evenCount : 0
		const oddZeroRatio = oddCount > 0 ? oddZeros / oddCount : 0

		// Concentrated zeros in one parity is a strong UTF-16 signal.
		if (
			(evenZeroRatio > 0.4 && oddZeroRatio < 0.05) ||
			(oddZeroRatio > 0.4 && evenZeroRatio < 0.05)
		) {
			return false
		}
	}

	// Then analyze byte content
	return analyzeByteContent(chunk)
}

/**
 * Checks if a file is binary using extension-based detection first, then content analysis
 */
export async function isBinaryFile(uri: vscode.Uri): Promise<boolean> {
	try {
		const stats = await vscode.workspace.fs.stat(uri)
		if (stats.type !== vscode.FileType.File) {
			return false
		}

		// First, check if the file extension indicates a binary file (fastest method)
		const fileName = uri.path.toLowerCase()
		const extension = fileName.substring(fileName.lastIndexOf('.'))
		if (BINARY_EXTENSIONS.has(extension)) {
			return true
		}

		// If extension is unknown, read first 8KB to check for binary content
		const content = await vscode.workspace.fs.readFile(uri)
		const chunk = content.slice(0, 8000)
		return looksBinary(chunk)
	} catch {
		// If we can't read the file, assume it's not binary
		return false
	}
}

// Define icons for files and folders (can be customized further)
const FOLDER_ICONS = {
	branch: 'folder', // Codicon for closed folder
	leaf: 'file', // Codicon for file
	open: 'folder-opened', // Codicon for opened folder
}

const FILE_ICONS = {
	branch: 'file', // Placeholder, not typically used for files by tree components
	leaf: 'file', // Codicon for file
	open: 'file', // Placeholder, not typically used for files by tree components
}

//  Cache for global git excludes path to avoid repeated spawning of git processes
let cachedGlobalExcludesPath: string | null = null

// Expand common shell-style tokens in paths from git config (e.g., '~/.config/git/ignore').
function resolveExcludesPath(input: string): string {
	let p = input.trim()
	if (p.startsWith('~')) {
		p = path.join(os.homedir(), p.slice(1))
	}
	// Expand $HOME or $USERPROFILE
	p = p.replace(/\$(HOME|USERPROFILE)/g, (_m, name) => {
		const env = process.env[String(name)]
		return env ? env : _m
	})
	// Expand Windows-style %VAR%
	p = p.replace(/%([^%]+)%/g, (_m, name) => {
		const env = process.env[name]
		return env ? env : _m
	})
	// Remove surrounding quotes if present without tricky escaping
	if (p.length >= 2) {
		const first = p.charCodeAt(0)
		const last = p.charCodeAt(p.length - 1)
		// 34 = '"', 39 = '\''
		if ((first === 34 && last === 34) || (first === 39 && last === 39)) {
			p = p.slice(1, -1)
		}
	}
	return path.resolve(p)
}

/**
 * Recursively reads a directory using vscode.workspace.fs and builds a tree structure.
 * @param currentUri The URI of the directory to read.
 * @param rootUri The URI of the workspace root for this directory (for .gitignore path relativity).
 * @param excludedDirs An array of additional directory patterns to exclude (like .gitignore patterns).
 * @param ign The ignore object from the 'ignore' package for .gitignore rules.
 * @param userIgnore The ignore object from the 'ignore' package for user-defined excluded patterns.
 * @returns A promise that resolves to an array of VscodeTreeItem objects.
 */
async function readDirectoryRecursiveForRoot(
	currentUri: vscode.Uri,
	rootUri: vscode.Uri,
	excludedDirs: string[],
	ign: ignore.Ignore,
	userIgnore: ignore.Ignore,
): Promise<VscodeTreeItem[]> {
	const items: VscodeTreeItem[] = []

	try {
		const entries = await vscode.workspace.fs.readDirectory(currentUri)

		// Sort entries: directories first, then alphabetically by name
		const sortedEntries = entries.sort((a, b) => {
			if (
				a[1] === vscode.FileType.Directory &&
				b[1] !== vscode.FileType.Directory
			)
				return -1
			if (
				a[1] !== vscode.FileType.Directory &&
				b[1] === vscode.FileType.Directory
			)
				return 1
			return a[0].localeCompare(b[0])
		})

		for (const [name, type] of sortedEntries) {
			const entryUri = vscode.Uri.joinPath(currentUri, name)
			const relativePathForIgnore = path.relative(
				rootUri.fsPath,
				entryUri.fsPath,
			)

			// Check .gitignore
			if (ign.ignores(relativePathForIgnore)) {
				continue
			}

			// Check user-defined excluded patterns
			if (userIgnore.ignores(relativePathForIgnore)) {
				continue
			}

			const item: VscodeTreeItem = {
				label: name,
				value: entryUri.toString(), // Use full URI string as the value
				// icons: type === vscode.FileType.Directory ? FOLDER_ICONS : { leaf: 'file' }, // Simplified, vscode-tree might handle this
			}

			if (type === vscode.FileType.Directory) {
				item.icons = FOLDER_ICONS // Apply folder icons
				const subItems = await readDirectoryRecursiveForRoot(
					entryUri,
					rootUri,
					excludedDirs,
					ign,
					userIgnore,
				)
				if (subItems.length > 0) {
					item.subItems = subItems
				}
			} else if (type === vscode.FileType.File) {
				item.icons = FILE_ICONS // Apply file icon
			}
			// Symlinks and Unknown types are currently ignored but could be handled

			items.push(item)
		}
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		console.error(
			`Error reading directory ${currentUri.fsPath}: ${errorMessage}`,
		)
		// Optionally, inform the user if a specific directory is unreadable
		// vscode.window.showWarningMessage(`Could not read directory: ${currentUri.fsPath}`);
	}

	return items
}

/**
 * Gets the file tree structure for all workspace folders, respecting .gitignore for each.
 * @param excludedDirs An array of additional directory names to exclude globally.
 * @returns A promise that resolves to an array of VscodeTreeItem objects, where each top-level item is a workspace root.
 */
export async function getWorkspaceFileTree(
	excludedDirs: string[],
	options?: { useGitignore?: boolean },
): Promise<VscodeTreeItem[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showInformationMessage('No workspace folder open.')
		return []
	}

	const allRootItems: VscodeTreeItem[] = []

	const useGitignore = options?.useGitignore !== false

	for (const folder of workspaceFolders) {
		const rootUri = folder.uri
		const rootFsPath = rootUri.fsPath

		// Build a comprehensive ignore rule set similar to Git's behavior:
		// - project .gitignore
		// - .git/info/exclude
		// - user's global excludes file (core.excludesFile), if available
		// The logic is best-effort and silently skips files that aren't present.
		const allIgnoreLines: string[] = []

		if (useGitignore) {
			// Parallelize reading of ignore files to reduce blocking time
			const [gitignoreContent, repoExcludeContent, globalExcludeContent] =
				await Promise.all([
					// 1) Project .gitignore (root)
					(async () => {
						const gitignorePath = path.join(rootFsPath, '.gitignore')
						try {
							const bytes = await vscode.workspace.fs.readFile(
								vscode.Uri.file(gitignorePath),
							)
							return Buffer.from(bytes).toString('utf8')
						} catch {
							return ''
						}
					})(),

					// 2) Repo-specific excludes: .git/info/exclude
					(async () => {
						const repoExcludePath = path.join(
							rootFsPath,
							'.git',
							'info',
							'exclude',
						)
						try {
							// Use async fs.readFile instead of readFileSync
							return await fs.promises.readFile(repoExcludePath, 'utf8')
						} catch {
							return ''
						}
					})(),

					// 3) Global excludes file
					(async () => {
						try {
							let excludesPath = cachedGlobalExcludesPath

							// If not cached, try to fetch it once per session
							if (excludesPath === null) {
								try {
									// execFile is async, but execFileSync is not.
									// For simplicity in this refactor without changing imports too much,
									// we'll wrap the sync call in a promise or just keep it sync if it's fast enough.
									// However, to truly parallelize, we should avoid blocking.
									// Since execFileSync is blocking, we can't easily make it async without execFile.
									// But we can at least run the file reading part async if we have the path.
									// Let's stick to the current logic for getting the path (it's cached anyway),
									// but make the file reading async.

									excludesPath = execFileSync(
										'git',
										['config', '--get', 'core.excludesFile'],
										{
											cwd: rootFsPath,
											encoding: 'utf8',
											stdio: ['ignore', 'pipe', 'ignore'],
											timeout: 1000,
										},
									).trim()
									cachedGlobalExcludesPath = excludesPath
								} catch {
									cachedGlobalExcludesPath = ''
									excludesPath = ''
								}
							}

							if (excludesPath) {
								const resolved = resolveExcludesPath(excludesPath)
								if (resolved && fs.existsSync(resolved)) {
									return await fs.promises.readFile(resolved, 'utf8')
								}
							} else {
								// Git not available or no core.excludesFile set; try common fallbacks
								const candidates = [
									path.join(os.homedir(), '.config', 'git', 'ignore'),
									path.join(os.homedir(), '.gitignore_global'),
									path.join(os.homedir(), '.gitignore'),
								]
								for (const p of candidates) {
									try {
										if (fs.existsSync(p)) {
											return await fs.promises.readFile(p, 'utf8')
										}
									} catch {
										// keep trying others
									}
								}
							}
						} catch {
							// Ignore errors
						}
						return ''
					})(),
				])

			if (gitignoreContent)
				allIgnoreLines.push(...gitignoreContent.split(/\r?\n/))
			if (repoExcludeContent)
				allIgnoreLines.push(...repoExcludeContent.split(/\r?\n/))
			if (globalExcludeContent)
				allIgnoreLines.push(...globalExcludeContent.split(/\r?\n/))
		}

		let ign = ignore()
		if (allIgnoreLines.length > 0) {
			ign = ignore().add(allIgnoreLines)
		}

		// Optional: add a few extremely common fallbacks to reduce noise/perf impact
		// only when not already covered (safe, minimal defaults)
		ign.add(['.git', '.hg', '.svn'])

		// Create ignore object for user-defined excluded patterns
		const userIgnore = ignore().add(excludedDirs)

		const subItems = await readDirectoryRecursiveForRoot(
			rootUri,
			rootUri, // rootUri itself is the base for relative ignore paths
			excludedDirs,
			ign,
			userIgnore,
		)

		const rootItem: VscodeTreeItem = {
			label: folder.name, // Use workspace folder name as label
			value: rootUri.toString(), // Use root URI string as value
			icons: FOLDER_ICONS, // Root is a folder
			subItems: subItems,
			// Optionally, mark as open by default
			// open: true,
		}
		allRootItems.push(rootItem)
	}

	return allRootItems
}
