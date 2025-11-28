import { Component, type ErrorInfo, type ReactNode } from 'react'
import { getVsCodeApi } from '../utils/vscode'

interface Props {
	children: ReactNode
	fallback?: ReactNode
}

interface State {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		}
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return {
			hasError: true,
			error,
		}
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('[ErrorBoundary] Caught error:', error, errorInfo)

		this.setState({
			error,
			errorInfo,
		})

		// Send error to extension for telemetry
		try {
			const vscode = getVsCodeApi()
			vscode.postMessage({
				command: 'webviewError',
				payload: {
					error: error.message,
					stack: error.stack,
					context: 'React ErrorBoundary',
					componentStack: errorInfo.componentStack,
				},
			})
		} catch (e) {
			console.error('Failed to send error to extension:', e)
		}
	}

	handleReset = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		})
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback
			}

			return (
				<div className="flex flex-col items-center justify-center h-screen p-4 text-center">
					<vscode-icon
						name="error"
						size={48}
						style={{
							color: 'var(--vscode-errorForeground)',
							marginBottom: '16px',
						}}
					/>
					<h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
					<p className="text-muted mb-4">
						{this.state.error?.message || 'An unexpected error occurred'}
					</p>
					<details className="text-left max-w-2xl w-full mb-4">
						<summary className="cursor-pointer text-sm text-muted mb-2">
							Error Details
						</summary>
						<pre className="text-xs bg-warn-bg border border-warn-border rounded p-2 overflow-auto max-h-60">
							{this.state.error?.stack}
							{this.state.errorInfo?.componentStack}
						</pre>
					</details>
					<vscode-button onClick={this.handleReset}>Try Again</vscode-button>
				</div>
			)
		}

		return this.props.children
	}
}

export default ErrorBoundary
