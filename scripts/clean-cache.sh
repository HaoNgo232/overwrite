#!/bin/bash

# Script dọn dẹp cache cho VS Code, Cursor và Antigravity
# Sử dụng khi gặp lỗi: "Error loading webview: Error: Could not register service worker"

# Check if running in auto mode (called from extension)
AUTO_MODE=false
if [[ "$1" == "--auto" ]]; then
    AUTO_MODE=true
fi

if [[ "$AUTO_MODE" == false ]]; then
    echo "⚠️  CẢNH BÁO: Vui lòng tắt hoàn toàn VS Code / Cursor / Antigravity trước khi tiếp tục."
    echo "Script này sẽ xóa các thư mục Cache, CachedData, GPUCache để khắc phục lỗi Webview."
    echo ""
    read -p "Bạn đã tắt IDE chưa? (y/n): " confirm
    
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Đã hủy. Vui lòng tắt IDE và chạy lại script."
        exit 1
    fi
else
    echo "🤖 Running in auto mode (called from extension)..."
fi

echo ""
echo "🔄 Đang dọn dẹp cache..."

# Hàm xóa cache an toàn
clean_cache() {
    local app_name=$1
    local config_dir=$2
    
    echo "Checking $app_name at $config_dir..."
    
    if [ -d "$config_dir" ]; then
        # Danh sách các folder cache cần xóa (KHÔNG xóa User, Workspaces, settings)
        rm -rf "$config_dir/Cache"
        rm -rf "$config_dir/CachedData"
        rm -rf "$config_dir/CachedExtensionVSIXs"
        rm -rf "$config_dir/CachedProfilesData"
        rm -rf "$config_dir/GPUCache"
        rm -rf "$config_dir/DawnGraphiteCache"
        rm -rf "$config_dir/Service Worker"
        
        echo " Đã xóa cache của $app_name"
    else
        echo "ℹ️  Không tìm thấy thư mục config của $app_name (bỏ qua)"
    fi
}

# Detect OS và xóa cache tương ứng
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    clean_cache "VS Code" "$HOME/Library/Application Support/Code"
    clean_cache "Cursor" "$HOME/Library/Application Support/Cursor"
    clean_cache "Antigravity" "$HOME/Library/Application Support/Antigravity"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash)
    clean_cache "VS Code" "$APPDATA/Code"
    clean_cache "Cursor" "$APPDATA/Cursor"
    clean_cache "Antigravity" "$APPDATA/Antigravity"
else
    # Linux
    clean_cache "VS Code" "$HOME/.config/Code"
    clean_cache "Cursor" "$HOME/.config/Cursor"
    clean_cache "Antigravity" "$HOME/.config/Antigravity"
    clean_cache "GoogleAntigravity" "$HOME/.config/GoogleAntigravity"
fi

echo ""
echo "🎉 Hoàn tất! Hãy thử mở lại IDE và kiểm tra plugin Overwrite."
echo "💡 Nếu vẫn lỗi, thử: Ctrl/Cmd + Shift + P → 'Developer: Reload Window'"