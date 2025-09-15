export interface ApplyResult {
	path: string
	action: string
	success: boolean
	message: string
}

export interface ChangeSummary {
	added: number
	removed: number
}

export interface PreviewTableRow {
	path: string
	action: 'create' | 'rewrite' | 'modify' | 'delete' | 'rename'
	description: string
	changes: ChangeSummary
	newPath?: string
	hasError?: boolean
	errorMessage?: string
	changeBlocks?: Array<{
		description: string
		search?: string
		content: string
	}>
}

export interface PreviewData {
	rows: PreviewTableRow[]
	errors: string[]
}

export interface ApplyChangeResponse {
	command: string
	success: boolean
	results?: ApplyResult[]
	errors?: string[]
	previewData?: PreviewData
}
