# VSCode Compatibility Notes

## Vấn Đề Tree Component Không Load

### Mô tả
Extension không thể load tree component trên các phiên bản VSCode mới (1.95+, 1.96+).

### Nguyên nhân
`@vscode-elements/elements` phiên bản **2.3.0** đã có **breaking changes** lớn:

1. **Complete Rewrite của Tree Component**: Component `<vscode-tree-item>` đã được viết lại hoàn toàn
2. **Thay đổi API**: Từ cấu trúc object phức tạp sang plain HTML markup
3. **Removal of Deprecated APIs**: Các API cũ đã bị loại bỏ
4. **Shadow DOM Changes**: Thay đổi cách styling và internal structure

### Giải pháp đã áp dụng
**Downgrade về phiên bản 2.2.0** - phiên bản ổn định cuối cùng trước breaking changes.

#### Các bước đã thực hiện:
```bash
cd src/webview-ui
pnpm remove @vscode-elements/elements
pnpm add @vscode-elements/elements@2.2.0
pnpm run build
cd ../..
pnpm run package
```

#### Lock version trong package.json:
```json
"dependencies": {
  "@vscode-elements/elements": "2.2.0"  // Không dùng ^2.2.0 để tránh auto-upgrade
}
```

### Lưu ý quan trọng
⚠️ **KHÔNG UPGRADE** `@vscode-elements/elements` lên 2.3.0+ trừ khi:
- Đã refactor toàn bộ tree component code
- Đã test kỹ trên nhiều phiên bản VSCode
- Đã cập nhật theo [migration guide](https://github.com/vscode-elements/elements/releases/tag/v2.3.0)

### Phiên bản đã test
-  VSCode 1.85.0+ với `@vscode-elements/elements@2.2.0`
- ❌ VSCode 1.95.0+ với `@vscode-elements/elements@2.3.0`

### Tham khảo
- [VSCode Elements v2.3.0 Release Notes](https://github.com/vscode-elements/elements/releases/tag/v2.3.0)
- [VSCode Elements v2.2.0 Release Notes](https://github.com/vscode-elements/elements/releases/tag/v2.2.0)

---
**Cập nhật lần cuối**: 2025-11-26
**Người thực hiện**: Antigravity AI Assistant
