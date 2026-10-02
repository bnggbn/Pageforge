# 固定書架

- `collection/` 放要匯入的 MD、TXT、PDF、EPUB、XLSX。第一次啟動會載入隨附的實際文件，之後按「重新載入資料夾」讀取新檔。
- `books/{document-id}/original.{ext}` 保存不可覆寫的來源。
- `books/{document-id}/manifest.json` 保存文件資訊、版本順序與進度。
- `books/{document-id}/versions/{revision-id}.json` 保存獨立的 VAX 版本快照。
- `.pageforge/settings.json` 保存字級與初次載入狀態。
- `.trash/` 保存從書架移除的文件；不會自動清空。

使用 `npm run dev:web` 開發，或 `npm run build:web` 後執行 `npm run start:web`。入口固定為 http://localhost:3000。

備份前先關閉服務，複製整個 `library/`。私人文件、版本與設定預設不納入 Git，只有隨附的四份文件與這份說明會提交。

如果要換資料夾，可設定 `PAGEFORGE_LIBRARY_ROOT`，但只在本機命令列設定，不透過網頁變更路徑。

來源目錄只掃描第一層檔案，不遞迴讀取其他資料夾。原始檔與版本不會上傳雲端。
