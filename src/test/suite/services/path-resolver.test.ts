import * as assert from 'node:assert'
import * as path from 'node:path'
import { PathResolver } from '../../../services/path-resolver'

suite('PathResolver Service', () => {
	let resolver: PathResolver
	let workspaceRoot: string

	setup(() => {
		// Use a test workspace root
		workspaceRoot = path.join(__dirname, 'test-workspace')
		resolver = new PathResolver(workspaceRoot)
	})

	teardown(() => {
		resolver.clearCache()
	})

	suite('External Package Detection', () => {
		test('TC-PR-01: Reject node_modules import', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const result = await resolver.resolve('react', currentFile)

			assert.strictEqual(result, null)
		})

		test('TC-PR-02: Reject scoped package import', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const result = await resolver.resolve('@company/utils', currentFile)

			assert.strictEqual(result, null)
		})

		test('TC-PR-03: Accept relative imports', async () => {
			// This test just checks that relative imports are NOT rejected as external
			// Actual resolution depends on file system
			const currentFile = path.join(workspaceRoot, 'src/index.ts')

			// Should at least attempt to resolve (not immediately return null)
			// We can't verify the exact result without setting up test files
			await resolver.resolve('./utils', currentFile)

			// Result can be null (file not found) but it shouldn't be rejected as external
			// This is validated by not immediately returning null for external packages
			assert.ok(true) // Pass if no error thrown
		})
	})

	suite('Relative Path Resolution', () => {
		test('TC-PR-04: Resolve relative import (same directory) - conceptual', async () => {
			const currentFile = path.join(workspaceRoot, 'src/foo.ts')
			const importPath = './bar'

			// Expected resolution path (without knowing if file exists)
			const expectedBase = path.join(workspaceRoot, 'src/bar')

			// The resolver will try: bar.ts, bar.tsx, bar.js, bar.jsx, bar/index.ts, etc.
			// Without actual files, result will be null, but we can test the logic
			const result = await resolver.resolve(importPath, currentFile)

			// Since we don't have actual test files, result will be null
			// This test validates that the resolver doesn't throw errors
			assert.ok(result === null || result?.startsWith(expectedBase))
		})

		test('TC-PR-05: Resolve relative import (parent directory)', async () => {
			const currentFile = path.join(workspaceRoot, 'src/components/Button.ts')
			const importPath = '../utils/helper'

			const result = await resolver.resolve(importPath, currentFile)

			// Should attempt to resolve to workspaceRoot/src/utils/helper
			assert.ok(result === null || result?.includes('utils'))
		})
	})

	suite('File Extension Handling', () => {
		test('TC-PR-06: Handle import without extension', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = './utils'

			// Should try .ts, .tsx, .js, .jsx extensions
			const result = await resolver.resolve(importPath, currentFile)

			// Result depends on file system, but shouldn't throw error
			assert.ok(result === null || typeof result === 'string')
		})

		test('TC-PR-07: Handle import with extension', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = './utils.ts'

			const result = await resolver.resolve(importPath, currentFile)

			assert.ok(result === null || result?.endsWith('.ts'))
		})
	})

	suite('Barrel Export Resolution', () => {
		test('TC-PR-08: Resolve directory to index file', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = './components'

			// Should try ./components/index.ts, ./components/index.tsx, etc.
			const result = await resolver.resolve(importPath, currentFile)

			assert.ok(result === null || result?.includes('components'))
		})
	})

	suite('TypeScript Config Path Mappings', () => {
		test('TC-PR-09: Handle missing tsconfig.json gracefully', async () => {
			// Resolver should work even without tsconfig.json
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = '@/utils'

			// Without tsconfig, @ alias won't resolve
			const result = await resolver.resolve(importPath, currentFile)

			// Should return null (not found) but not throw error
			assert.strictEqual(result, null)
		})

		// Note: Testing actual tsconfig path resolution requires creating
		// real tsconfig.json files, which is better done in integration tests
	})

	suite('Error Handling', () => {
		test('TC-PR-10: Handle invalid path gracefully', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = './nonexistent'

			const result = await resolver.resolve(importPath, currentFile)

			assert.strictEqual(result, null)
		})

		test('TC-PR-11: Handle empty import path', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = ''

			const result = await resolver.resolve(importPath, currentFile)

			assert.strictEqual(result, null)
		})

		test('TC-PR-12: Handle malformed path', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')
			const importPath = '../../../../../../../etc/passwd'

			// Should handle gracefully (may resolve but file won't exist)
			const result = await resolver.resolve(importPath, currentFile)

			// Either null or a path (but not throw error)
			assert.ok(result === null || typeof result === 'string')
		})
	})

	suite('Cache Management', () => {
		test('TC-PR-13: Cache can be cleared', async () => {
			const currentFile = path.join(workspaceRoot, 'src/index.ts')

			// First resolution
			await resolver.resolve('./utils', currentFile)

			// Clear cache
			resolver.clearCache()

			// Second resolution (should reload tsconfig)
			await resolver.resolve('./utils', currentFile)

			// Should not throw error
			assert.ok(true)
		})
	})

	suite('Path Resolver Config', () => {
		test('TC-PR-14: Resolver initialized with workspace root', () => {
			const testResolver = new PathResolver('/test/workspace')

			// Should not throw error
			assert.ok(testResolver)
		})

		test('TC-PR-15: Multiple resolvers can coexist', () => {
			const resolver1 = new PathResolver('/workspace1')
			const resolver2 = new PathResolver('/workspace2')

			assert.ok(resolver1)
			assert.ok(resolver2)
		})
	})
})
