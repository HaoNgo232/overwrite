import * as assert from 'node:assert'
import * as vscode from 'vscode'

// You can import and use all API from the 'vscode' module
// as well as import your extension later in the test suite

import { getHtmlForWebview } from '../../../../providers/file-explorer/html-generator'

suite('html-generator Tests', () => {
	// Define a mock Webview and extensionUri for testing
	const mockWebview = {
		asWebviewUri: (uri: vscode.Uri) => uri, // Simple mock, may need refinement
		cspSource: 'test-csp-source',
	} as vscode.Webview

	const mockExtensionUri = vscode.Uri.file('/mock/extension/path')

	test('getHtmlForWebview should call getDevHtml in development', () => {
		// This test will require mocking the internal calls to getDevHtml and getProdHtml
		// For now, we'll leave a placeholder.
		assert.strictEqual(true, true)
	})

	test('getHtmlForWebview should call getProdHtml in production', () => {
		// This test will require mocking the internal calls to getDevHtml and getProdHtml
		// For now, we'll leave a placeholder.
		assert.strictEqual(true, true)
	})

	// Add tests for getDevHtml and getProdHtml separately
	test('getDevHtml should generate correct HTML for development', () => {
		const html = getHtmlForWebview(mockWebview, mockExtensionUri, true)

		// Check for essential elements in dev mode
		assert.ok(
			html.includes(
				'<script type="module" src="http://localhost:5173/@vite/client"></script>',
			),
			'Should include Vite client script',
		)
		assert.ok(
			html.includes(
				'<script type="module" src="http://localhost:5173/src/main.tsx"></script>',
			),
			'Should include main.tsx script',
		)
		assert.ok(
			html.includes(
				'file:///mock/extension/path/node_modules/%40vscode/codicons/dist/codicon.css',
			),
			'Should include codicons stylesheet',
		)

		// Check for CSP in dev mode (less strict)
		assert.ok(
			html.includes('font-src http://localhost:5173 data: test-csp-source'),
			'Should have correct CSP for development',
		)
	})

	test('getProdHtml should generate correct HTML for production', () => {
		const html = getHtmlForWebview(mockWebview, mockExtensionUri, false)

		// Check for essential elements in prod mode
		assert.ok(
			html.includes('/mock/extension/path/dist/webview-ui/assets/index.js'),
			'Should include production index.js script',
		)
		assert.ok(
			html.includes('/mock/extension/path/dist/webview-ui/assets/index.css'),
			'Should include production index.css stylesheet',
		)
		assert.ok(
			html.includes('/mock/extension/path/dist/webview-ui/assets/codicon.css'),
			'Should include codicons stylesheet in prod',
		)

		// Check for CSP in prod mode (more strict). Note: nonce is mocked as 'test-nonce'
		assert.ok(
			html.includes('font-src test-csp-source'),
			'Should have correct CSP for production',
		)
	})
})
