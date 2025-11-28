import { useEffect, useRef, useState } from 'react'
import ExcludedFolders from './excluded-folders'
import RespectGitignoreToggle from './respect-gitignore-toggle'

interface SettingsTabProps {
	excludedFolders: string
	readGitignore: boolean
	onSaveSettings: (payload: {
		excludedFolders: string
		readGitignore: boolean
	}) => void
	onCopyDebugLogs?: () => void
}

const SettingsTab: React.FC<SettingsTabProps> = ({
	excludedFolders,
	readGitignore,
	onSaveSettings,
	onCopyDebugLogs,
}) => {
	// Generic form draft state – scalable for future settings
	const [draft, setDraft] = useState<{
		excludedFolders: string
		readGitignore: boolean
	}>(() => ({ excludedFolders, readGitignore }))
	const [isDirty, setIsDirty] = useState(false)
	const [showSaved, setShowSaved] = useState(false)
	const [isApplying, setIsApplying] = useState(false) //  New applying state
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Sync incoming prop to draft and reset dirty when saved externally
	useEffect(() => {
		setDraft({ excludedFolders, readGitignore })
		setIsDirty(false)
	}, [excludedFolders, readGitignore])

	const handleChange = (field: keyof typeof draft, value: string | boolean) => {
		setDraft((prev) => {
			const next = { ...prev, [field]: value } as typeof prev
			setIsDirty(
				next.excludedFolders !== excludedFolders ||
					next.readGitignore !== readGitignore,
			)
			return next
		})
	}

	const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
		e.preventDefault()

		//  Show applying state immediately for user feedback
		setIsApplying(true)

		onSaveSettings({
			excludedFolders: draft.excludedFolders,
			readGitignore: draft.readGitignore,
		})

		setIsDirty(false)

		//  Show applying feedback, then success message
		setTimeout(() => {
			setIsApplying(false)
			setShowSaved(true)

			if (savedTimerRef.current !== null) {
				globalThis.clearTimeout(savedTimerRef.current)
				savedTimerRef.current = null
			}
			savedTimerRef.current = globalThis.setTimeout(() => {
				setShowSaved(false)
				savedTimerRef.current = null
			}, 2000) //  Increased to 2s for better visibility
		}, 600) //  Show applying state for 600ms
	}

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (savedTimerRef.current !== null) {
				globalThis.clearTimeout(savedTimerRef.current)
				savedTimerRef.current = null
			}
		}
	}, [])

	// No explicit onClick fallback to avoid double-submit; rely on form submit

	return (
		<div className="py-2">
			<vscode-label className="block mb-1">Settings</vscode-label>
			<form
				id="settings-form"
				className="flex flex-col gap-y-3 min-h-full"
				onSubmit={handleSubmit}
			>
				<ExcludedFolders
					excludedFolders={draft.excludedFolders}
					onChangeExcludedFolders={(v) => handleChange('excludedFolders', v)}
					onDraftChange={(v) => handleChange('excludedFolders', v)}
				/>

				<RespectGitignoreToggle
					checked={draft.readGitignore}
					onChange={(v) => handleChange('readGitignore', v)}
					onDraftChange={(v) => handleChange('readGitignore', v)}
				/>

				{/* Debug Section */}
				<div className="pt-3 mt-3 border-t border-[var(--vscode-panel-border)]">
					<vscode-label className="block mb-2">🐛 Debugging</vscode-label>
					<vscode-button
						appearance="secondary"
						type="button"
						onClick={(e) => {
							e.preventDefault()
							onCopyDebugLogs?.()
						}}
						className="w-full"
					>
						<span slot="start" className="codicon codicon-bug"></span>
						Copy Error Logs (for AI Context)
					</vscode-button>
					<p className="text-xs text-muted mt-1">
						Copies recent extension errors, stack traces & system info to
						clipboard. Perfect for pasting to AI chats when debugging issues.
					</p>
				</div>

				{/* Sticky footer with bottom-left Save button */}
				<div className="sticky bottom-0 left-0 bg-bg border-t border-[var(--vscode-panel-border)] pt-2 pb-2 flex items-center gap-x-3">
					<vscode-button
						type="submit"
						disabled={!isDirty || isApplying}
						onClick={(e) => {
							// In some test/jsdom environments, custom elements don't submit forms by default.
							// Ensure we requestSubmit on the nearest form for reliability.
							const form = (e.currentTarget as unknown as HTMLElement).closest(
								'form',
							)
							form?.requestSubmit()
						}}
					>
						{isApplying ? (
							<>
								<span
									slot="start"
									className="codicon codicon-loading codicon-modifier-spin"
								></span>
								Applying...
							</>
						) : (
							'Save'
						)}
					</vscode-button>

					{showSaved && (
						<span
							className="text-xs"
							style={{ color: 'var(--vscode-testing-iconPassed)' }}
						>
							Settings applied &amp; tree refreshed
						</span>
					)}

					{isApplying && !showSaved && (
						<span className="text-xs text-muted">
							🔄 Applying settings and refreshing tree...
						</span>
					)}
				</div>
			</form>
		</div>
	)
}

export default SettingsTab
