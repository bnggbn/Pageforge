# 目錄與架構

## 現有目錄

| 路徑 | 用途 | 狀態 |
| --- | --- | --- |
| `apps/web/` | Next.js Web UI | 匯入、書架、閱讀、筆記、編輯與版本比較 |
| `apps/desktop/` | Electron 外殼 | 啟動與打包設定 |
| `apps/mobile/` | Expo App | 首頁雛形，獨立安裝依賴 |
| `core/corpus/` | 文件模型與服務 | 預留目錄 |
| `core/vax/` | 版本日誌 | 預留目錄 |
| `core/crypto/` | 加密能力 | 預留目錄 |
| `core/common/` | 共用工具 | 預留目錄 |
| `packages/sdk/` | Client SDK | 只有套件宣告 |
| `selfhost-api/` | 自架 API | 只有環境變數範例 |
| `docs/spec/` | 規格與決策 | 第一版開發依據 |

## 第一版分工

- UI：`apps/web/`，負責匯入、書架、閱讀與錯誤提示。
- 文件模型與匯入：目前在 `apps/web/lib/documents.ts` 與 `importer.ts`；`core/corpus/` 保留為多端提取位置。
- VAX 版本：`apps/web/lib/history.ts` 直接使用既有 `vax-sdk 1.0.0`，建立與驗證版本鏈；`core/vax/` 尚未提取。
- 本機儲存：`apps/web/lib/storage.ts` 以 IndexedDB transaction 保存來源、版本、摘要與進度。
- Reader：`apps/web/components/reader/ReaderWorkspace.tsx` 與 `DocumentContent.tsx`；使用捲動模式，舊翻頁元件未開放。
- 測試：`apps/web/tests/` 保存自製格式 fixture 與瀏覽器完整流程測試。

核心規則保持獨立於 React 與瀏覽器 API。建立 core 套件時補上 package 與 TypeScript 設定。

## 實作預設

| 項目 | 第一版決定 | 原因 |
| --- | --- | --- |
| 平台 | Web 優先 | 先完成可使用的閱讀流程 |
| 內容 | Markdown、TXT、PDF、EPUB、XLSX | 依格式區分閱讀、筆記與編輯能力 |
| 儲存 | IndexedDB | 文件與進度可在本機保存 |
| 進度 | 版本、區塊位置與區塊內比例 | 調整字級與視窗後可定位 |
| 帳號 | 免登入 | 本機閱讀無需帳號 |
| 雲端 | 後續規劃 | 先定義同步、權限與維運需求 |

## 多端限制

Web 採靜態匯出，閱讀頁使用固定 `/reader/?id=...` 路由，ID 在瀏覽器查詢本機儲存。

Desktop 使用 `file://` 載入產物，資源路徑、導覽與本機儲存需在打包後驗證。Mobile 的儲存實作需另行設計。
