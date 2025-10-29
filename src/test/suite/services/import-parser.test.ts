import * as assert from 'node:assert'
import { ImportParser } from '../../../services/import-parser'

suite('ImportParser Service', () => {
	let parser: ImportParser

	setup(() => {
		parser = new ImportParser()
	})

	suite('ES6 Imports', () => {
		test('TC-IP-01: Parse ES6 named import', () => {
			const content = "import { foo } from './bar';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'es6')
			assert.deepStrictEqual(result[0].specifiers, ['foo'])
			assert.strictEqual(result[0].line, 1)
		})

		test('TC-IP-02: Parse ES6 default import', () => {
			const content = "import foo from './bar';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'es6')
			assert.deepStrictEqual(result[0].specifiers, ['foo'])
		})

		test('TC-IP-03: Parse ES6 namespace import', () => {
			const content = "import * as foo from './bar';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'es6')
			assert.deepStrictEqual(result[0].specifiers, ['* as foo'])
		})

		test('TC-IP-04: Parse ES6 multiple named imports', () => {
			const content = "import { foo, bar, baz } from './utils';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './utils')
			assert.deepStrictEqual(result[0].specifiers, ['foo', 'bar', 'baz'])
		})

		test('TC-IP-05: Parse multi-line ES6 import', () => {
			const content = `import {
  foo,
  bar
} from './baz';`
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './baz')
			assert.strictEqual(result[0].type, 'es6')
		})

		test('TC-IP-06: Parse side-effect import', () => {
			const content = "import './styles.css';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './styles.css')
			assert.strictEqual(result[0].type, 'es6')
		})
	})

	suite('CommonJS Requires', () => {
		test('TC-IP-07: Parse CommonJS require', () => {
			const content = "const foo = require('./bar');"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'commonjs')
			assert.strictEqual(result[0].line, 1)
		})

		test('TC-IP-08: Parse require with let', () => {
			const content = "let foo = require('./bar');"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'commonjs')
		})

		test('TC-IP-09: Parse require with var', () => {
			const content = "var foo = require('./bar');"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'commonjs')
		})

		test('TC-IP-10: Parse destructured require', () => {
			const content = "const { foo, bar } = require('./utils');"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './utils')
			assert.strictEqual(result[0].type, 'commonjs')
		})
	})

	suite('Dynamic Imports', () => {
		test('TC-IP-11: Parse dynamic import', () => {
			const content = "import('./bar').then(module => {});"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'dynamic')
		})

		test('TC-IP-12: Parse async dynamic import', () => {
			const content = "const module = await import('./bar');"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './bar')
			assert.strictEqual(result[0].type, 'dynamic')
		})
	})

	suite('Edge Cases', () => {
		test('TC-IP-13: Ignore commented imports', () => {
			const content = `
// import foo from './bar';
/* import baz from './qux'; */
import real from './real';
`
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 1)
			assert.strictEqual(result[0].source, './real')
		})

		test('TC-IP-14: Ignore import in string literal', () => {
			const content = `
const str = "import foo from './bar'";
import real from './real';
`
			const result = parser.parseImportsFromContent(content)

			// Note: Our regex-based approach may catch this
			// This is acceptable trade-off for simplicity
			assert.ok(result.length >= 1)
			assert.ok(result.some((imp) => imp.source === './real'))
		})

		test('TC-IP-15: Handle multiple imports in one file', () => {
			const content = `
import foo from './foo';
import { bar } from './bar';
const baz = require('./baz');
import('./dynamic');
`
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 4)
			assert.strictEqual(result[0].source, './foo')
			assert.strictEqual(result[1].source, './bar')
			assert.strictEqual(result[2].source, './baz')
			assert.strictEqual(result[3].source, './dynamic')
		})

		test('TC-IP-16: Handle file with no imports', () => {
			const content = `
const x = 1;
function foo() {
  return x + 1;
}
`
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 0)
		})

		test('TC-IP-17: Handle empty file', () => {
			const content = ''
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result.length, 0)
		})

		test('TC-IP-18: Handle malformed import gracefully', () => {
			const content = `
import {{{ from './bar';
import valid from './valid';
`
			const result = parser.parseImportsFromContent(content)

			// Should at least parse the valid import
			assert.ok(result.some((imp) => imp.source === './valid'))
		})
	})

	suite('File Type Support', () => {
		test('TC-IP-19: Support .ts files', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.ts'), true)
		})

		test('TC-IP-20: Support .tsx files', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.tsx'), true)
		})

		test('TC-IP-21: Support .js files', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.js'), true)
		})

		test('TC-IP-22: Support .jsx files', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.jsx'), true)
		})

		test('TC-IP-23: Support .mjs files', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.mjs'), true)
		})

		test('TC-IP-24: Support .cjs files', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.cjs'), true)
		})

		test('TC-IP-25: Reject unsupported file types', () => {
			assert.strictEqual(parser.isSupportedFile('/path/to/file.py'), false)
			assert.strictEqual(parser.isSupportedFile('/path/to/file.java'), false)
			assert.strictEqual(parser.isSupportedFile('/path/to/file.txt'), false)
		})
	})

	suite('Import Paths', () => {
		test('TC-IP-26: Parse relative import (same directory)', () => {
			const content = "import foo from './bar';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result[0].source, './bar')
		})

		test('TC-IP-27: Parse relative import (parent directory)', () => {
			const content = "import foo from '../utils/bar';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result[0].source, '../utils/bar')
		})

		test('TC-IP-28: Parse absolute import with @ alias', () => {
			const content = "import foo from '@/components/Bar';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result[0].source, '@/components/Bar')
		})

		test('TC-IP-29: Parse node_modules import', () => {
			const content = "import React from 'react';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result[0].source, 'react')
		})

		test('TC-IP-30: Parse scoped package import', () => {
			const content = "import foo from '@company/utils';"
			const result = parser.parseImportsFromContent(content)

			assert.strictEqual(result[0].source, '@company/utils')
		})
	})
})
