import { useCallback, useEffect, useRef, useState } from 'react'
import type { VscodeTreeItem } from '../../../../types'
import { getVsCodeApi } from '../../utils/vscode'
import CopyActions from './copy-actions'
import FileExplorer from './file-explorer/index'
import TokenStats from './token-stats'
import UserInstructions from './user-instructions'
import { countTokens } from './utils'

interface ContextTabProps {
	selectedCount: number
	onCopy: ({
		includeXml,
		userInstructions,
	}: {
		includeXml: boolean
		userInstructions: string
	}) => void
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string>
	onSelect: (uris: Set<string>) => void
	onRefresh: (excludedFolders?: string) => void
	isLoading: boolean
}

const ContextTab: React.FC<ContextTabProps> = ({
	selectedCount,
	onCopy,
	fileTreeData,
	selectedUris,
	onSelect,
	onRefresh,
	isLoading,
}) => {
	const [userInstructions, setUserInstructions] = useState('')
	const [searchQuery, setSearchQuery] = useState('')
	const [tokenStats, setTokenStats] = useState({
		fileTokensEstimate: 0,
		userInstructionsTokens: 0,
		totalTokens: 0,
		totalWithXmlTokens: 0,
	})
	const [actualTokenCounts, setActualTokenCounts] = useState<
		Record<string, number>
	>({})
	const [skippedFiles, setSkippedFiles] = useState<
		Array<{ uri: string; reason: string; message?: string }>
	>([])
	// const [includeXml, setIncludeXml] = useState(false)

	// Debounce timer for user instructions token counting (use ref to avoid re-renders)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Constant for XML formatting instructions
	const XML_INSTRUCTIONS_TOKENS = 5000 // This is an approximation

	// Effect to calculate total tokens based on actual file counts and instructions
	useEffect(() => {
		// Clear any existing timer
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}

		// Calculate file total immediately
		const fileTotal = Object.values(actualTokenCounts).reduce(
			(sum, count) => sum + count,
			0,
		)

		// Update file totals immediately
		setTokenStats((prev) => ({
			...prev,
			fileTokensEstimate: fileTotal,
			totalTokens: fileTotal + prev.userInstructionsTokens,
			totalWithXmlTokens:
				fileTotal + prev.userInstructionsTokens + XML_INSTRUCTIONS_TOKENS,
		}))

		// Debounce user instructions token counting
		const timer = setTimeout(async () => {
			const instructionsTokens = await countTokens(userInstructions)

			setTokenStats((prev) => ({
				...prev,
				userInstructionsTokens: instructionsTokens,
				totalTokens: fileTotal + instructionsTokens,
				totalWithXmlTokens:
					fileTotal + instructionsTokens + XML_INSTRUCTIONS_TOKENS,
			}))
		}, 500)

		debounceRef.current = timer

		// Cleanup function
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current)
			}
		}
	}, [actualTokenCounts, userInstructions])

	// Debounced request for token counts on selection changes
	useEffect(() => {
		const vscode = getVsCodeApi()
		const urisArray = Array.from(selectedUris)
		if (urisArray.length === 0) {
			setActualTokenCounts({})
			setSkippedFiles([])
			return
		}
		const handle = setTimeout(() => {
			vscode.postMessage({
				command: 'getTokenCounts',
				payload: { selectedUris: urisArray },
			})
		}, 200)
		return () => clearTimeout(handle)
	}, [selectedUris])

	// Effect to listen for token count updates from the extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.command === 'updateTokenCounts') {
				const incoming: Record<string, number> =
					message.payload.tokenCounts || {}
				// Shallow diff and only update if changed
				let changed = false
				const next: Record<string, number> = { ...actualTokenCounts }
				for (const [k, v] of Object.entries(incoming)) {
					if (next[k] !== v) {
						next[k] = v
						changed = true
					}
				}
				// Remove keys that no longer exist
				for (const k of Object.keys(next)) {
					if (!(k in incoming)) {
						delete next[k]
						changed = true
					}
				}
				if (changed) setActualTokenCounts(next)
				setSkippedFiles(message.payload.skippedFiles || [])
			}
		}
		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [actualTokenCounts])

	const handleRefreshClick = useCallback(() => {
		// Reset skipped files and token counts when refreshing to clear any deleted files
		setSkippedFiles([])
		setActualTokenCounts({})
		// Call the refresh function (use persisted excluded folders on backend)
		onRefresh()
	}, [onRefresh])

	return (
		<div className="flex flex-col h-full overflow-hidden gap-y-2 py-2 pb-20">
			{/* Sticky header area (tabs are outside this component; keep this non-scrolling) */}
			<div className="bg-bg z-10">
				{/* User Instructions at top */}
				<UserInstructions
					userInstructions={userInstructions}
					onUserInstructionsChange={setUserInstructions}
				/>

				{/* Explorer Top Bar */}
				<div className="mt-2 mb-2 flex items-center">
					<vscode-button 
						onClick={handleRefreshClick} 
						disabled={isLoading}
						className="transition-all duration-200 ease-out"
					>
						<span 
							slot="start" 
							className={`codicon codicon-refresh transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} 
						/>
						{isLoading ? 'Loading...' : 'Refresh'}
					</vscode-button>
					<vscode-textfield
						placeholder="Search files..."
						className="ml-2 flex-1"
						value={searchQuery}
						onInput={(e) =>
							setSearchQuery((e.target as HTMLInputElement).value)
						}
					>
						<span slot="start" className="codicon codicon-search" />
					</vscode-textfield>
				</div>
			</div>

			{/* Scrollable tree area only */}
			<div
				data-testid="context-tree-scroll"
				className="flex-1 min-h-0 overflow-auto pb-24 transition-all duration-300 ease-out"
			>
				{/* File Explorer */}
				<div className={`transition-opacity duration-300 ${isLoading ? 'opacity-95' : 'opacity-100'}`}>
					<FileExplorer
						fileTreeData={fileTreeData}
						selectedUris={selectedUris}
						onSelect={onSelect}
						isLoading={isLoading}
						searchQuery={searchQuery}
						actualTokenCounts={actualTokenCounts}
					/>
				</div>

				{/* Skipped files disclosure (scrolls with tree) */}
				{skippedFiles.length > 0 && (
					<details className="mt-2 text-xs text-error bg-warn-bg border border-warn-border rounded px-2 py-2">
						<summary className="cursor-pointer list-none">
							⚠️ Skipped Files ({skippedFiles.length})
						</summary>
						<div className="mt-1">
							{skippedFiles.map((file, index) => (
								<div key={index} className="mb-0.5">
									<span className="font-mono">{file.uri.split('/').pop()}</span>
									{' - '}
									<span className="italic">
										{file.reason === 'binary'
											? 'Binary file'
											: file.reason === 'too-large'
												? 'Too large'
												: 'Error'}
									</span>
									{file.message && (
										<span className="text-muted"> ({file.message})</span>
									)}
								</div>
							))}
						</div>
					</details>
				)}
			</div>

			{/* Fixed footer with compact tokens + actions */}
			<div className="fixed bottom-0 left-0 right-0 border-t bg-bg/95 backdrop-blur px-3 py-2 z-10">
				<div className="flex items-center gap-3 h-full">
					<TokenStats
						selectedCount={selectedCount}
						className="flex-grow"
						tokenStats={tokenStats}
						skippedFiles={[]}
					/>
					<CopyActions
						onCopy={({ includeXml: inc, userInstructions }) =>
							onCopy({ includeXml: inc, userInstructions })
						}
						userInstructions={userInstructions}
					/>
				</div>
			</div>
		</div>
	)
}

export default ContextTab
