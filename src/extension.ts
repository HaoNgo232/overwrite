import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { FileExplorerWebviewProvider } from './providers/file-explorer'
import { telemetry } from './services/telemetry'
import {
	clearCache as clearTokenCache,
	shutdown as shutdownTokenCounter,
} from './services/token-counter'

/**
 * Detect webview issues and offer recovery
 */
async function detectAndOfferRecovery(context: vscode.ExtensionContext) {
	const crashCount = context.globalState.get<number>('crashRecoveryCount', 0)

	// Only offer recovery if we've had multiple quick restarts
	if (crashCount < 2) {
		context.globalState.update('crashRecoveryCount', crashCount + 1)
		// Reset counter after 1 minute
		setTimeout(() => {
			context.globalState.update('crashRecoveryCount', 0)
		}, 60000)
		return
	}

	// Reset counter
	context.globalState.update('crashRecoveryCount', 0)

	const selection = await vscode.window.showWarningMessage(
		'Overwrite extension detected potential webview issues. This may be caused by IDE cache corruption.',
		'Fix Now (Recommended)',
		'Show Instructions',
		'Ignore',
	)

	if (selection === 'Fix Now (Recommended)') {
		await runCacheCleanup(context)
	} else if (selection === 'Show Instructions') {
		showManualInstructions()
	}
}

/**
 * Run cache cleanup via integrated terminal
 */
async function runCacheCleanup(context: vscode.ExtensionContext) {
	const extensionPath = context.extensionPath
	const scriptPath = path.join(extensionPath, 'scripts', 'clean-cache.sh')

	// Check OS
	const isWindows = os.platform() === 'win32'

	if (isWindows) {
		// Windows: Use PowerShell script
		const psScriptPath = path.join(extensionPath, 'scripts', 'clean-cache.ps1')

		const terminal = vscode.window.createTerminal({
			name: 'Overwrite Cache Cleanup',
			hideFromUser: false,
		})

		terminal.show()
		terminal.sendText(
			`Write-Host "🔄 Cleaning IDE cache..." -ForegroundColor Yellow`,
		)
		terminal.sendText(`& "${psScriptPath}"`)
		terminal.sendText(
			`Write-Host " Done! Reloading window in 3 seconds..." -ForegroundColor Green`,
		)
		terminal.sendText('Start-Sleep -Seconds 3')
		terminal.sendText('code --command workbench.action.reloadWindow')
	} else {
		// Linux/Mac: Use bash script
		const terminal = vscode.window.createTerminal({
			name: 'Overwrite Cache Cleanup',
			hideFromUser: false,
		})

		terminal.show()
		terminal.sendText(`echo "🔄 Cleaning IDE cache..."`)
		terminal.sendText(`chmod +x "${scriptPath}"`)
		terminal.sendText(`"${scriptPath}" --auto`)
		terminal.sendText(`echo " Done! Reloading window in 3 seconds..."`)
		terminal.sendText('sleep 3')
		terminal.sendText('code --command workbench.action.reloadWindow')
	}

	vscode.window.showInformationMessage(
		'Cache cleanup is running in the terminal. Window will reload automatically.',
		'OK',
	)
}

/**
 * Show manual cleanup instructions
 */
function showManualInstructions() {
	const isWindows = os.platform() === 'win32'
	const isMac = os.platform() === 'darwin'

	let instructions = ''

	if (isWindows) {
		instructions = `
Windows Cache Cleanup Instructions:

1. Close VS Code/Cursor completely
2. Open File Explorer and navigate to:
   - %APPDATA%\\Code\\Cache
   - %APPDATA%\\Cursor\\Cache
3. Delete these folders
4. Restart your IDE

Or run in PowerShell:
\`\`\`powershell
Remove-Item -Recurse -Force "$env:APPDATA\\Code\\Cache"
Remove-Item -Recurse -Force "$env:APPDATA\\Cursor\\Cache"
\`\`\`
`
	} else if (isMac) {
		instructions = `
macOS Cache Cleanup Instructions:

1. Close VS Code/Cursor completely
2. Open Terminal and run:
\`\`\`bash
rm -rf ~/Library/Application\\ Support/Code/Cache
rm -rf ~/Library/Application\\ Support/Cursor/Cache
\`\`\`
3. Restart your IDE
`
	} else {
		instructions = `
Linux Cache Cleanup Instructions:

1. Close VS Code/Cursor completely
2. Open Terminal and run:
\`\`\`bash
rm -rf ~/.config/Code/Cache
rm -rf ~/.config/Cursor/Cache
\`\`\`
3. Restart your IDE
`
	}

	vscode.window
		.showInformationMessage('Opening cleanup instructions...', 'Open README')
		.then((selection) => {
			if (selection === 'Open README') {
				vscode.env.openExternal(
					vscode.Uri.parse(
						'https://github.com/mnismt/overwrite#troubleshooting',
					),
				)
			}
		})

	// Also show in output channel
	const output = vscode.window.createOutputChannel('Overwrite Cache Cleanup')
	output.appendLine(instructions)
	output.show()
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Starting Overwrite extension')

	// Detect if this is a recovery from previous crash
	const lastActivation = context.globalState.get<number>('lastActivation', 0)
	const now = Date.now()
	const timeSinceLastActivation = now - lastActivation

	// If activated within 5 seconds of last activation, might be a crash recovery
	const isPotentialCrashRecovery =
		timeSinceLastActivation < 5000 && lastActivation > 0

	// AUTO CLEAR CACHE khi khởi động để đảm bảo clean state
	try {
		clearTokenCache()
		console.log('[Overwrite] Token cache cleared on startup for clean state')
	} catch (e) {
		console.warn('[Overwrite] Failed to clear token cache on startup', e)
	}

	// Store activation time for crash detection
	context.globalState.update('lastActivation', now)

	// Check for webview loading issues
	if (isPotentialCrashRecovery) {
		detectAndOfferRecovery(context)
	}

	// Initialize telemetry early
	try {
		telemetry.init(context)
	} catch (e) {
		console.warn('[telemetry] init failed', e)
	}

	// Register the Webview View Provider
	const provider = new FileExplorerWebviewProvider(
		context.extensionUri,
		context,
	)

	const providerDisposable = vscode.window.registerWebviewViewProvider(
		FileExplorerWebviewProvider.viewType,
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		},
	)

	// Register cache cleanup command
	const cleanCacheCommand = vscode.commands.registerCommand(
		'overwrite.cleanCache',
		async () => {
			await runCacheCleanup(context)
		},
	)

	// Register both provider registration and provider disposal
	context.subscriptions.push(providerDisposable, cleanCacheCommand, {
		dispose: () => provider.dispose(),
	})
}

// This method is called when your extension is deactivated
export async function deactivate() {
	console.log('Deactivating Overwrite extension')

	// Shutdown telemetry with timeout protection
	try {
		await Promise.race([
			telemetry.shutdown(),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Telemetry shutdown timeout')), 3000),
			),
		])
	} catch (e) {
		console.warn('[telemetry] shutdown failed (non-critical)', e)
	}

	// Shutdown token counter - now using static import
	try {
		shutdownTokenCounter()
		console.log('[Overwrite] Token counter shutdown completed')
	} catch (e) {
		console.warn('[token-counter] shutdown failed', e)
	}
}
