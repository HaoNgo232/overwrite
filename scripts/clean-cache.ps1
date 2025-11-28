# PowerShell script để dọn dẹp cache cho VS Code và Cursor trên Windows
# Sử dụng khi gặp lỗi: "Error loading webview: Error: Could not register service worker"

param(
    [switch]$Auto
)

if (-not $Auto) {
    Write-Host "⚠️ CẢNH BÁO: Vui lòng tắt hoàn toàn VS Code / Cursor trước khi tiếp tục." -ForegroundColor Yellow
    Write-Host "Script này sẽ xóa các thư mục Cache, CachedData, GPUCache để khắc phục lỗi Webview."
    Write-Host ""
    $confirm = Read-Host "Bạn đã tắt IDE chưa? (y/n)"
    
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Đã hủy. Vui lòng tắt IDE và chạy lại script." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "🤖 Running in auto mode (called from extension)..." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "🔄 Đang dọn dẹp cache..." -ForegroundColor Cyan

function Clean-AppCache {
    param(
        [string]$AppName,
        [string]$ConfigDir
    )
    
    Write-Host "Checking $AppName at $ConfigDir..." -ForegroundColor Gray
    
    if (Test-Path $ConfigDir) {
        # Danh sách các folder cache cần xóa
        $cacheFolders = @(
            "Cache",
            "CachedData",
            "CachedExtensionVSIXs",
            "CachedProfilesData",
            "GPUCache",
            "DawnGraphiteCache",
            "Service Worker"
        )
        
        foreach ($folder in $cacheFolders) {
            $path = Join-Path $ConfigDir $folder
            if (Test-Path $path) {
                Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
            }
        }
        
        Write-Host " Đã xóa cache của $AppName" -ForegroundColor Green
    } else {
        Write-Host "ℹ️  Không tìm thấy thư mục config của $AppName (bỏ qua)" -ForegroundColor Gray
    }
}

# Xóa cache cho các IDE
Clean-AppCache "VS Code" "$env:APPDATA\Code"
Clean-AppCache "Cursor" "$env:APPDATA\Cursor"
Clean-AppCache "Antigravity" "$env:APPDATA\Antigravity"

Write-Host ""
Write-Host "🎉 Hoàn tất! Hãy thử mở lại IDE và kiểm tra plugin Overwrite." -ForegroundColor Green
Write-Host "💡 Nếu vẫn lỗi, thử: Ctrl+Shift+P → 'Developer: Reload Window'" -ForegroundColor Yellow
