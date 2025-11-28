import * as os from 'node:os'
import * as vscode from 'vscode'

interface LogEntry {
	timestamp: string
	source: 'backend' | 'webview'
	context: string
	message: string
	stack?: string
}

class ErrorLoggerService {
	private logs: LogEntry[] = []
	private readonly MAX_LOGS = 30

	/**
	 * Log an error with context
	 */
	log(source: 'backend' | 'webview', context: string, error: unknown) {
		const timestamp = new Date().toISOString()
		const message = error instanceof Error ? error.message : String(error)
		const stack = error instanceof Error ? error.stack : undefined

		const entry: LogEntry = {
			timestamp,
			source,
			context,
			message,
			stack,
		}

		this.logs.push(entry)

		// Keep only recent logs
		if (this.logs.length > this.MAX_LOGS) {
			this.logs.shift()
		}
	}

	/**
	 * Format logs as Markdown for AI context
	 */
	getFormattedLogs(): string {
		if (this.logs.length === 0) {
			return '# Overwrite Extension Debug Logs\n\nNo errors logged in this session.'
		}

		const systemInfo = [
			`**OS**: ${os.platform()} ${os.release()}`,
			`**VS Code**: ${vscode.version}`,
			'**Extension**: Overwrite',
			`**Session**: ${new Date().toISOString()}`,
		].join('\n')

		const logsStr = this.logs
			.slice() // Copy array
			.reverse() // Newest first
			.map((entry, index) => {
				const stackSection = entry.stack
					? `\n\n**Stack Trace:**\n\`\`\`\n${entry.stack}\n\`\`\``
					: ''

				return `## Error #${index + 1} - ${entry.timestamp}

**Source**: ${entry.source}
**Context**: ${entry.context}  
**Message**: ${entry.message}${stackSection}`
			})
			.join('\n\n---\n\n')

		return `# 🐛 Overwrite Extension Debug Logs

${systemInfo}

---

${logsStr}

---

**How to use this info:**
1. Copy this entire text
2. Paste to AI chat (Claude, Cursor, etc.)  
3. Ask AI to analyze the errors and suggest fixes`
	}

	clear() {
		this.logs = []
	}

	getLogCount(): number {
		return this.logs.length
	}
}

export const errorLogger = new ErrorLoggerService()
