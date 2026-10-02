# Pageforge

開源文件閱讀、筆記與版本管理工具，優先提供本機閱讀空間。

## 目前可用

- 書架：本機文件、搜尋、閱讀狀態篩選與排序；未匯入時顯示示意書封，不包含書籍全文。
- 匯入：UTF-8 Markdown／TXT、PDF、EPUB、XLSX，支援重複來源檢查與儲存失敗提示。
- 閱讀：Markdown 排版、純文字換行、EPUB 章節文字、Excel 工作表與瀏覽器 PDF 閱讀器。
- 筆記：選取文字引用、手動位置標記、保存與移除；每次操作保留版本。
- 編輯：Markdown／TXT 直接修改，保存為新版本，可匯出目前文字。
- 版本：使用 `vax-sdk 1.0.0` 的 JCS／SAI 版本鏈，開啟時驗證原始檔、快照與版本事件；文字／筆記 diff、還原成新版本、匯出歷史 JSON。
- 進度：文字區塊與區塊內比例、章節／工作表位置、字級設定；PDF 手動保存頁碼書籤。
- 刪除：確認後，同一 IndexedDB transaction 移除文件、版本與進度。

文字文件上限 5 MiB，PDF／EPUB／XLSX 上限 20 MiB；ZIP 解壓另有限制。文件只保存在目前瀏覽器的 origin，清除網站資料會失去文件、筆記與版本。尚未提供完整備份還原；請下載原始檔、匯出目前文字與版本紀錄。

## 格式能力

| 格式 | 閱讀 | 筆記 | 直接編輯 | 限制 |
| --- | --- | --- | --- | --- |
| Markdown／TXT | 是 | 是 | 是 | UTF-8；不執行內嵌 HTML，不自動載入圖片 |
| PDF | 瀏覽器閱讀器 | 手動標記頁碼 | 尚未提供 | 閱讀器可用性依瀏覽器；頁碼書籤手動保存 |
| EPUB | 依章節呈現文字 | 是 | 尚未提供 | 不保留出版社排版／圖片；不支援 DRM |
| XLSX | 多工作表儲存格 | 是 | 尚未提供 | 顯示原始值／公式快取，不重算公式、不保留格式；不支援舊版 XLS |

VAX 提供本機鏈式完整性驗證，未包含數位簽章或外部可信錨點。Pageforge 的差異畫面比較 VAX 版本快照；本次未修改 [VAX 倉庫](https://github.com/bnggbn/vax-action-history)。

## 開發

需 Node.js 與 npm，在根目錄執行：

```sh
npm ci
npm run dev:web
```

Windows PowerShell 若禁止 npm.ps1，改用 `npm.cmd`。

```sh
npm run build:web
npm run test:web
```

`test:web` 先建置，再以獨立測試瀏覽器與暫時 HTTP server 驗證匯入、保存、筆記、編輯、diff、還原、多分頁衝突、儲存失敗、刪除與版本完整性。Windows 預設使用現有 Edge；其他系統需先執行 `npx playwright install chromium`，也可用 `PAGEFORGE_BROWSER_CHANNEL` 指定瀏覽器 channel。測試檔與截圖寫入忽略的 `.preview/`。

Desktop 需先啟動 Web，再於另一個終端執行 `npm run dev:desktop`；打包使用 `npm run build:all`。Desktop `file://` 下的完整文件流程尚未驗證。

Mobile 目前獨立安裝：

```sh
cd apps/mobile
npm install
npm run start
```

Desktop 與 Mobile 尚未串接本次 Web 文件能力。登入畫面仍是雛形；本機閱讀免登入。API 目前只有 `selfhost-api/.env.example`，未實作同步或託管。

## 規格

- [專案定位與路線圖](docs/spec/PLAN_ZH.md)
- [功能與驗收](docs/spec/MVP.md)
- [資料模型與 VAX 版本](docs/spec/DATA_MODEL.md)
- [目錄與架構](docs/spec/REPO_STRUCTURE.md)
- [依賴管理](docs/spec/dependency.md)
- [待辦與已知限制](docs/spec/ISSUES.md)

預計採 MIT 授權，正式授權文件與著作權資訊待補。
