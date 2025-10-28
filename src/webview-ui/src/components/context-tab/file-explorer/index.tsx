import React, {
	startTransition,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import type { VscodeTreeItem } from '../../../types'
import { getVsCodeApi } from '../../../utils/vscode'
import { FileTreeSkeleton, LoadingOverlay } from '../../loading'
import { filterTreeData, getAllDescendantPaths } from '../utils'
import type { FolderSelectionState } from './row-decorations'
import TreeNode from './tree-node'

import { buildTreeIndex } from './tree-index'

interface FileExplorerProps {
	fileTreeData: VscodeTreeItem[]
	selectedUris: Set<string>
	onSelect: (uris: Set<string>) => void
	isLoading: boolean
	searchQuery: string
	actualTokenCounts: Record<string, number>
}

// Helper to count visible files in filtered tree
function countVisibleFiles(items: VscodeTreeItem[]): number {
	let count = 0
	for (const item of items) {
		if (!item.subItems || item.subItems.length === 0) {
			count++
		} else if (item.subItems) {
			count += countVisibleFiles(item.subItems)
		}
	}
	return count
}

type LoadingPhase = 'initial' | 'skeleton' | 'progressive' | 'complete'

const FileExplorer: React.FC<FileExplorerProps> = ({
	fileTreeData,
	selectedUris,
	onSelect,
	isLoading,
	searchQuery,
	actualTokenCounts,
}) => {
	// Loading phase management
	const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('initial')
	const [isRefreshing, setIsRefreshing] = useState(false)

	// Defer heavy recalculations when selection/token counts change massively
	const deferredSelectedUris = useDeferredValue(selectedUris)
	const deferredTokenCounts = useDeferredValue(actualTokenCounts)

	// Keep refs for latest values to avoid stale closures
	const actualTokenCountsRef = useRef(actualTokenCounts)
	useEffect(() => {
		actualTokenCountsRef.current = actualTokenCounts
	}, [actualTokenCounts])

	// Loading phase effects
	useEffect(() => {
		if (isLoading) {
			// If we have existing data, this is a refresh
			if (fileTreeData.length > 0) {
				setIsRefreshing(true)
				setLoadingPhase('initial')
			} else {
				setIsRefreshing(false)
				setLoadingPhase('skeleton')
			}
			return
		}

		// Data has loaded
		if (fileTreeData.length === 0) {
			setLoadingPhase('initial')
			return
		}

		setLoadingPhase('progressive')
		setTimeout(() => {
			setLoadingPhase('complete')
			setIsRefreshing(false)
		}, 300)
	}, [isLoading, fileTreeData.length])

	// Filtered items based on search
	const visibleItems = useMemo(() => {
		return searchQuery
			? filterTreeData(fileTreeData, searchQuery)
			: fileTreeData
	}, [fileTreeData, searchQuery])

	// Build index for current visible tree
	const index = useMemo(() => buildTreeIndex(visibleItems), [visibleItems])

	// Stable refs to avoid function identity changes and stale closures
	const selectedUrisRef = useRef(selectedUris)
	const indexRef = useRef(index)
	selectedUrisRef.current = selectedUris
	indexRef.current = index

	// Derived per-node metrics based on selection + tokens (single post-order pass)
	const { selectedCountMap, tokenTotalsMap } = useMemo(() => {
		const selectedCountMap = new Map<string, number>()
		const tokenTotalsMap = new Map<string, number>()
		for (const uri of index.postOrder) {
			const n = index.nodes.get(uri)!
			if (n.isFolder) {
				let sc = 0
				let tt = 0
				for (const c of n.children) {
					sc += selectedCountMap.get(c) || 0
					tt += tokenTotalsMap.get(c) || 0
				}
				selectedCountMap.set(uri, sc)
				tokenTotalsMap.set(uri, tt)
				continue
			}
			const isSelected = deferredSelectedUris.has(uri)
			selectedCountMap.set(uri, isSelected ? 1 : 0)
			tokenTotalsMap.set(uri, isSelected ? deferredTokenCounts[uri] || 0 : 0)
		}
		return { selectedCountMap, tokenTotalsMap }
	}, [index, deferredSelectedUris, deferredTokenCounts])

	// Selection helpers
	const toggleFile = useCallback(
		(uri: string) => {
			const next = new Set(selectedUrisRef.current)
			if (next.has(uri)) next.delete(uri)
			else next.add(uri)
			startTransition(() => onSelect(next))
		},
		[onSelect],
	)

	const selectAllInSubtree = useCallback(
		(uri: string) => {
			const node = indexRef.current.nodes.get(uri)
			if (node === undefined) return
			// Yield to the browser, then perform heavy traversal in a task
			setTimeout(() => {
				const next = new Set(selectedUrisRef.current)
				for (const u of getAllDescendantPaths(node.item)) next.add(u)
				startTransition(() => onSelect(next))
			}, 0)
		},
		[onSelect],
	)

	const deselectAllInSubtree = useCallback(
		(uri: string) => {
			const node = indexRef.current.nodes.get(uri)
			if (node === undefined) return
			setTimeout(() => {
				const next = new Set(selectedUrisRef.current)
				for (const u of getAllDescendantPaths(node.item)) next.delete(u)
				startTransition(() => onSelect(next))
			}, 0)
		},
		[onSelect],
	)

	const getFolderSelectionState = useCallback(
		(uri: string): FolderSelectionState => {
			const total = index.descendantFileCount.get(uri) || 0
			if (total === 0) return 'none'
			const selected = selectedCountMap.get(uri) || 0
			if (selected === 0) return 'none'
			return selected === total ? 'full' : 'partial'
		},
		[index, selectedCountMap],
	)

	const renderTreeItems = (
		items: VscodeTreeItem[],
		depth = 0,
	): React.ReactNode[] => {
		return items.map((item, _itemIndex) => {
			const isFolder = !!(item.subItems && item.subItems.length > 0)
			const totalDescFiles = index.descendantFileCount.get(item.value) || 0
			const selectedDescFiles = selectedCountMap.get(item.value) || 0
			const folderState = isFolder
				? getFolderSelectionState(item.value)
				: 'none'
			const folderTokens = isFolder ? tokenTotalsMap.get(item.value) || 0 : 0
			const fileSelected = isFolder
				? false
				: deferredSelectedUris.has(item.value)
			const fileTokens = isFolder ? 0 : deferredTokenCounts[item.value] || 0
			const isOpen = item.open ?? depth === 0

			return (
				<TreeNode
					key={item.value}
					item={item}
					depth={depth}
					isFolder={isFolder}
					isOpen={isOpen}
					totalDescendantFiles={totalDescFiles}
					selectedDescendantFiles={selectedDescFiles}
					folderSelectionState={folderState}
					folderTokenTotal={folderTokens}
					fileIsSelected={fileSelected}
					fileTokenCount={fileTokens}
					onToggleFile={toggleFile}
					onSelectAllInSubtree={selectAllInSubtree}
					onDeselectAllInSubtree={deselectAllInSubtree}
					renderChildren={renderTreeItems}
				/>
			)
		})
	}

	// Handle actual double-clicks to open files in VS Code
	const handleTreeDoubleClick = useCallback((e: React.MouseEvent) => {
		const target = e.target as HTMLElement | null
		if (target === null) return
		const itemEl = target.closest('vscode-tree-item') as HTMLElement | null
		if (itemEl === null) return
		const uri = itemEl.dataset.uri
		if (uri === undefined) return
		// Only open if this is a file (not a folder)
		const node = indexRef.current.nodes.get(uri)
		if (node === undefined || node.isFolder) return
		const vscode = getVsCodeApi()
		vscode.postMessage({ command: 'openFile', payload: { fileUri: uri } })
	}, [])

	// Determine what content to show based on loading phase
	const renderContent = () => {
		switch (loadingPhase) {
			case 'initial':
				return (
					<div className="flex justify-center items-center h-full min-h-32">
						<vscode-progress-ring />
					</div>
				)

			case 'skeleton':
				return <FileTreeSkeleton itemCount={15} className="px-2" />

			case 'progressive':
			case 'complete':
				return (
					<div
						className={`tree-container ${loadingPhase === 'complete' ? 'loaded' : 'loading'}`}
					>
						<vscode-tree
							onDoubleClick={handleTreeDoubleClick}
							expand-mode="singleClick"
							indent-guides
						>
							{renderTreeItems(visibleItems)}
						</vscode-tree>
					</div>
				)

			default:
				return (
					<div className="flex justify-center items-center h-full">
						<vscode-progress-ring />
					</div>
				)
		}
	}

	// Calculate search results count when search is active
	const searchResultsCount = searchQuery ? countVisibleFiles(visibleItems) : 0
	const hasSearchResults = searchQuery && searchResultsCount > 0

	return (
		<div className="flex-1 overflow-auto mb-2 relative">
			{/* Search results indicator */}
			{searchQuery && (
				<div className="sticky top-0 z-10 bg-bg border-b border-border px-2 py-1 text-xs text-muted">
					{hasSearchResults ? (
						<span>
							Found {searchResultsCount} file
							{searchResultsCount === 1 ? '' : 's'} matching "{searchQuery}"
						</span>
					) : (
						<span className="text-error">
							No files found matching "{searchQuery}"
						</span>
					)}
				</div>
			)}

			{renderContent()}

			{/* Refresh overlay - shows when refreshing existing data */}
			<LoadingOverlay
				isVisible={isRefreshing && loadingPhase === 'initial'}
				message="Refreshing files..."
			/>
		</div>
	)
}

export default React.memo(FileExplorer)
