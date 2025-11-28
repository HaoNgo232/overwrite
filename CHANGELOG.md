# Change Log

All notable changes to the "Overwrite" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.3] - 2025-01-XX

### Added
- **Utility script**: `scripts/clean-cache.sh` để tự động xóa IDE cache khi gặp lỗi
- Cache validation system với version tracking để detect corrupted entries
- Comprehensive troubleshooting guide trong README
- CSP restrictions để prevent Service Worker registration trong webview

### Fixed
- **Critical**: Fixed webview loading errors sau khi IDE crashes/tắt đột ngột
- **Critical**: Disabled PostHog Service Worker để prevent InvalidStateError
- Auto-removal của corrupted cache entries với validation
- Improved error recovery và cleanup mechanisms
- File tree exploration with gitignore support
- XML prompt generation for LLMs
- File operation application (create/modify/delete/rename)
- Token counting with caching
- Multi-root workspace support
- Settings management for excluded folders

### Fixed
- Repository URL mismatch in package.json
- Error recovery improvements for tree building

## [0.0.2] - 2024-12-XX

### Added
- Initial release of Overwrite extension
- Basic file tree exploration
- XML context generation
- Apply tab for LLM response processing

### Known Issues
- Limited error handling for tree building operations