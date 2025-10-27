import type { VscTabsSelectEvent } from '@vscode-elements/elements/dist/vscode-tabs/vscode-tabs'
import { useCallback, useEffect, useState } from 'react'
import type { VscodeTreeItem } from './types' // Import tree item type from local types
import './App.css'
import ApplyTab from './components/apply-tab/index'
import ContextTab from './components/context-tab'
import { getAllDescendantPaths } from './components/context-tab/utils'
import SettingsTab from './components/settings-tab'
import { getVsCodeApi } from './utils/vscode' // Import the new utility

// Helper function to extract all URIs from tree
function getAllUrisFromTree(items: VscodeTreeItem[]): Set<string> {
	const uris = new Set<string>()

	function walk(nodes: VscodeTreeItem[]) {
		for (const node of nodes) {
			uris.add(node.value)
			if (node.subItems) {
				walk(node.subItems)
			}
		}
	}

	walk(items)
	return uris
}

// Helper function to find an item in tree by URI
function findItemInTree(
	items: VscodeTreeItem[],
	targetUri: string,
): VscodeTreeItem | null {
	for (const item of items) {
		if (item.value === targetUri) return item
		if (item.subItems) {
			const found = findItemInTree(item.subItems, targetUri)
			if (found) return found
		}
	}
	return null
}

// Helper function to check if item is a file (no subItems)
function isFileItem(item: VscodeTreeItem | null): boolean {
	return item !== null && (!item.subItems || item.subItems.length === 0)
}

interface VsCodeMessage {
	command: string
	payload?: unknown // Use unknown instead of any for better type safety
}

interface UpdateExcludedFoldersPayload {
	excludedFolders: string
}

interface UpdateSettingsPayload {
	excludedFolders: string
	readGitignore: boolean
}

function App() {
	const [activeTabIndex, setActiveTabIndex] = useState(0) // Manage by index (0: Context, 1: Apply)
	const [fileTreeData, setFileTreeData] = useState<VscodeTreeItem[]>([])
	// selectedPaths renamed to selectedUris, stores Set of URI strings
	const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set())
	// Track folders that are fully selected (all descendants selected)
	const [fullySelectedFolders, setFullySelectedFolders] = useState<Set<string>>(
		new Set(),
	)
	const [isLoading, setIsLoading] = useState<boolean>(true) // For loading indicator
	const [excludedFolders, setExcludedFolders] = useState<string>('') // Persisted excluded folders
	const [readGitignore, setReadGitignore] = useState<boolean>(true)

	// Handle file tree updates with auto-selection logic
	const handleUpdateFileTreeMessage = useCallback(
		(payload: unknown) => {
			if (!Array.isArray(payload)) return

			const newTree = payload as VscodeTreeItem[]
			setFileTreeData(newTree)

			// Clean invalid selections and auto-select new files in fully selected folders
			const validUris = getAllUrisFromTree(newTree)
			const updatedSelection = new Set(
				Array.from(selectedUris).filter((uri) => validUris.has(uri)),
			)

			// Process fully selected folders
			const processFolder = (item: VscodeTreeItem) => {
				if (fullySelectedFolders.has(item.value)) {
					const allDescendants = getAllDescendantPaths(item)
					for (const uri of allDescendants) {
						const foundItem = findItemInTree(newTree, uri)
						if (isFileItem(foundItem)) {
							updatedSelection.add(uri)
						}
					}
				}

				if (item.subItems) {
					for (const sub of item.subItems) {
						processFolder(sub)
					}
				}
			}

			for (const root of newTree) {
				processFolder(root)
			}

			if (
				updatedSelection.size !== selectedUris.size ||
				Array.from(updatedSelection).some((uri) => !selectedUris.has(uri))
			) {
				setSelectedUris(updatedSelection)
			}
		},
		[selectedUris, fullySelectedFolders],
	)

	// Send message to extension using the utility
	const sendMessage = useCallback((command: string, payload?: unknown) => {
		try {
			const vscode = getVsCodeApi()

			if (command === 'getFileTree') {
				setIsLoading(true)
			}
			vscode.postMessage({ command, payload })
		} catch (error) {
			console.error('Error sending message to extension:', error)
			// Send error to extension for telemetry
			try {
				const vscode = getVsCodeApi()
				vscode.postMessage({
					command: 'webviewError',
					payload: {
						error: error instanceof Error ? error.message : String(error),
						context: `sendMessage(${command})`,
					},
				})
			} catch (e) {
				console.error('Failed to send error to extension:', e)
			}
		}
	}, [])

	// Global error handling for webview
	useEffect(() => {
		const handleError = (event: ErrorEvent) => {
			console.error('Unhandled error in webview:', event.error)
			try {
				const vscode = getVsCodeApi()
				vscode.postMessage({
					command: 'webviewError',
					payload: {
						error:
							event.error instanceof Error
								? event.error.message
								: String(event.error),
						context: 'global error handler',
					},
				})
			} catch (e) {
				console.error('Failed to send error to extension:', e)
			}
		}

		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			console.error('Unhandled promise rejection in webview:', event.reason)
			try {
				const vscode = getVsCodeApi()
				vscode.postMessage({
					command: 'webviewError',
					payload: {
						error:
							event.reason instanceof Error
								? event.reason.message
								: String(event.reason),
						context: 'unhandled promise rejection',
					},
				})
			} catch (e) {
				console.error('Failed to send error to extension:', e)
			}
		}

		globalThis.addEventListener('error', handleError)
		globalThis.addEventListener('unhandledrejection', handleUnhandledRejection)

		return () => {
			globalThis.removeEventListener('error', handleError)
			globalThis.removeEventListener(
				'unhandledrejection',
				handleUnhandledRejection,
			)
		}
	}, [])

	// Fetch initial file tree and settings
	useEffect(() => {
		sendMessage('getFileTree')
		sendMessage('getSettings')
	}, [sendMessage])

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<VsCodeMessage>) => {
			const message = event.data

			switch (message.command) {
				case 'updateFileTree':
				case 'updateFileTreeAfterApply': {
					handleUpdateFileTreeMessage(message.payload)
					setIsLoading(false)
					break
				}
				case 'showError':
					// Display error message in a dismissible banner
					{
						const payload = message.payload
						let text = 'An unexpected error occurred.'
						if (typeof payload === 'string') {
							text = payload
						} else if (
							payload &&
							typeof payload === 'object' &&
							'message' in (payload as Record<string, unknown>) &&
							typeof (payload as { message?: unknown }).message === 'string'
						) {
							text = String((payload as { message: string }).message)
						}
						console.error('Error from extension:', text)
					}
					setIsLoading(false) // Stop loading on error too
					break
				case 'updateExcludedFolders': {
					// Back-compat: if extension sends legacy message, update excluded only
					const payload = message.payload as UpdateExcludedFoldersPayload
					if (payload?.excludedFolders)
						setExcludedFolders(payload.excludedFolders)
					break
				}
				case 'updateSettings': {
					const p = message.payload as UpdateSettingsPayload
					if (p) {
						if (typeof p.excludedFolders === 'string')
							setExcludedFolders(p.excludedFolders)
						if (typeof p.readGitignore === 'boolean')
							setReadGitignore(p.readGitignore)
					}
					break
				}
				case 'tokenCountResponse':
					// Token count responses are handled individually by countTokens calls
					// No action needed here, just preventing the unknown command warning
					break
				case 'updateTokenCounts':
					// ContextTab listens for this and updates its own state.
					// Handle here to avoid unknown-command warnings.
					break
				case 'applyChangesResult':
					// ApplyTab listens for this and updates its own state.
					// Handle here to avoid unknown-command warnings.
					break
				case 'previewChangesResult':
					// ApplyTab listens for this and updates its own state.
					break
				case 'applyRowChangeResult':
					// ApplyTab listens for this and updates its own state.
					break
				case 'previewRowChangeResult':
					// Row-level preview acknowledgement; UI opens diff directly in VS Code.
					break
				default:
					console.warn('Received unknown message command:', message.command)
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [selectedUris]) // Add dependency

	// --- Tab Content Handlers ---

	const handleTabChange = useCallback((event: VscTabsSelectEvent) => {
		setActiveTabIndex(event.detail.selectedIndex)
	}, [])

	// Refresh handler for the file tree (moved from potential ExplorerTab)
	const handleRefresh = useCallback(
		(excludedFoldersArg?: string) => {
			setIsLoading(true)
			sendMessage('getFileTree', {
				excludedFolders: excludedFoldersArg,
				readGitignore,
			})
		},
		[sendMessage, readGitignore],
	)

	// Save settings handler (excluded folders + readGitignore)
	const handleSaveSettings = useCallback(
		(payload: { excludedFolders: string; readGitignore: boolean }) => {
			setExcludedFolders(payload.excludedFolders)
			setReadGitignore(payload.readGitignore)
			sendMessage('saveSettings', payload)
			// immediately refresh file tree using the saved settings
			sendMessage('getFileTree', payload)
		},
		[sendMessage],
	)

	// Selection handler (assuming it will be needed in the combined ContextTab)
	// Renamed paths to uris, expects a Set of URI strings
	const handleSelect = useCallback(
		(uris: Set<string>) => {
			setSelectedUris(uris)

			// Update fully selected folders tracking
			const fullySelected = new Set<string>()

			const getFileDescendants = (item: VscodeTreeItem): string[] => {
				const allDescendants = getAllDescendantPaths(item)
				return allDescendants.filter((uri) => {
					const foundItem = findItemInTree(fileTreeData, uri)
					return isFileItem(foundItem)
				})
			}

			const checkFolder = (item: VscodeTreeItem) => {
				if (item.subItems && item.subItems.length > 0) {
					const fileDescendants = getFileDescendants(item)

					// If all file descendants are selected, mark folder as fully selected
					if (
						fileDescendants.length > 0 &&
						fileDescendants.every((uri) => uris.has(uri))
					) {
						fullySelected.add(item.value)
					}

					// Recursively check subfolders
					for (const sub of item.subItems) {
						checkFolder(sub)
					}
				}
			}

			for (const root of fileTreeData) {
				checkFolder(root)
			}

			setFullySelectedFolders(fullySelected)
		},
		[fileTreeData],
	)

	// Context Tab: Handle copying
	const handleCopy = useCallback(
		({
			includeXml,
			userInstructions,
		}: { includeXml: boolean; userInstructions: string }) => {
			if (selectedUris.size === 0) {
				// Use selectedUris
				// Display warning in the UI since we can't show VS Code notifications from webview
				console.warn('No files selected. Please select files before copying.')
				return
			}

			// Send message to extension with payload
			sendMessage(includeXml ? 'copyContextXml' : 'copyContext', {
				selectedUris: Array.from(selectedUris), // Use selectedUris and correct payload key
				userInstructions,
			})
		},
		[selectedUris, sendMessage], // Depend on selectedUris
	)

	// Apply Tab: Handle applying changes
	const handleApply = useCallback(
		(responseText: string) => {
			sendMessage('applyChanges', { responseText })
		},
		[sendMessage],
	)

	// Apply Tab: Handle previewing changes (opens diff editors, no writes)
	const handlePreview = useCallback(
		(responseText: string) => {
			sendMessage('previewChanges', { responseText })
		},
		[sendMessage],
	)

	// Apply Tab: Handle applying individual row
	const handleApplyRow = useCallback(
		(responseText: string, rowIndex: number) => {
			sendMessage('applyRowChange', { responseText, rowIndex })
		},
		[sendMessage],
	)

	// Apply Tab: Handle previewing an individual row (opens a diff for that file action)
	const handlePreviewRow = useCallback(
		(responseText: string, rowIndex: number) => {
			sendMessage('previewRowChange', { responseText, rowIndex })
		},
		[sendMessage],
	)

	return (
		<main className="h-screen overflow-hidden">
			<vscode-tabs
				className="h-full overflow-hidden"
				selected-index={activeTabIndex}
				onvsc-tabs-select={handleTabChange}
			>
				<vscode-tab-header slot="header" id="context-tab">
					Context
				</vscode-tab-header>
				<vscode-tab-panel id="context-tab-panel">
					<ContextTab
						// Props for original Context functionality
						selectedCount={selectedUris.size} // Use selectedUris
						onCopy={handleCopy}
						// Props for Explorer functionality
						fileTreeData={fileTreeData}
						selectedUris={selectedUris} // Pass selectedUris
						onSelect={handleSelect} // Pass the handler
						onRefresh={handleRefresh}
						isLoading={isLoading}
					/>
				</vscode-tab-panel>

				{/* Apply Tab */}
				<vscode-tab-header slot="header" id="apply-tab">
					Apply
				</vscode-tab-header>
				<vscode-tab-panel id="apply-tab-panel">
					<ApplyTab
						onApply={handleApply}
						onPreview={handlePreview}
						onApplyRow={handleApplyRow}
						onPreviewRow={handlePreviewRow}
					/>
				</vscode-tab-panel>

				{/* Settings Tab */}
				<vscode-tab-header slot="header" id="settings-tab">
					Settings
				</vscode-tab-header>
				<vscode-tab-panel id="settings-tab-panel">
					<SettingsTab
						excludedFolders={excludedFolders}
						readGitignore={readGitignore}
						onSaveSettings={handleSaveSettings}
					/>
				</vscode-tab-panel>
			</vscode-tabs>
		</main>
	)
}

export default App
