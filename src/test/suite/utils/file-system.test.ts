import * as assert from 'node:assert'
import { looksBinary } from '../../../utils/file-system'

suite('File System Utils - Binary Detection', () => {
	test('TC-FS-01: UTF-8 Vietnamese markdown should NOT be detected as binary', () => {
		const md = '# Ý tưởng 🚀\n\nNội dung tiếng Việt có dấu: Yêu Cầu Luận Văn.\n'
		const bytes = Buffer.from(md, 'utf8')
		assert.strictEqual(looksBinary(bytes), false)
	})

	test('TC-FS-02: UTF-16LE text with BOM should NOT be detected as binary', () => {
		const text = 'Xin chào thế giới'
		const utf16le = Buffer.from(text, 'utf16le')
		const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), utf16le])
		assert.strictEqual(looksBinary(bytes), false)
	})

	test('TC-FS-03: Magic number (PNG) should be detected as binary', () => {
		const pngHeader = Uint8Array.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		])
		assert.strictEqual(looksBinary(pngHeader), true)
	})

	test('TC-FS-04: Many NUL bytes should be detected as binary', () => {
		const bytes = new Uint8Array(8000)
		assert.strictEqual(looksBinary(bytes), true)
	})
})
