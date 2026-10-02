# Pageforge

開源文件閱讀、筆記與版本管理工具，優先提供本機閱讀空間。

## 目前可用

- 書架：本機文件、搜尋、閱讀狀態篩選與排序；直接讀取固定資料夾的實際文件，不再顯示假書名 demo。
- 匯入：UTF-8 Markdown／TXT、PDF、EPUB、XLSX，支援重複來源檢查與儲存失敗提示。
- 閱讀：Markdown 排版、純文字換行、EPUB 章節文字、Excel 工作表與瀏覽器 PDF 閱讀器。
- 筆記：選取文字引用、手動位置標記、保存與移除；每次操作保留版本。
- 編輯：Markdown／TXT 直接修改，保存為新版本，可匯出目前文字。
- 版本：使用 `vax-sdk 1.0.0` 的 JCS／SAI 版本鏈，開啟時驗證原始檔、快照與版本事件；文字／筆記 diff、還原成新版本、匯出歷史 JSON。
- 進度：文字區塊與區塊內比例、章節／工作表位置、字級設定；PDF 手動保存頁碼書籤。
- 刪除：確認後移出書架；固定資料夾模式移到 library/.trash/，瀏覽器模式原子刪除。

預設使用專案的 [library/](library/README.md) 固定資料夾。

- 把自己的文件放進 `library/collection/`，按「重新載入資料夾」；也可在畫面選擇匯入。
- 原始檔保存到 `library/books/{id}/original.{ext}`。
- 版本以獨立 JSON 保存在 `library/books/{id}/versions/`，manifest 保存順序與進度。
- 原有瀏覽器書架可透過「轉入瀏覽器書架」複製到硬碟，原資料保留。同來源但不同版本鏈不會被覆蓋，會提示尚未合併。
- 備份前先關閉服務，複製整個 library/。刪除的文件先留在 library/.trash/，由使用者自行管理。
- 私人文件、筆記、版本與設定預設忽略 Git，僅提交隨附的專案閱讀文件。

文字文件上限 5 MiB，PDF／EPUB／XLSX 上限 20 MiB；ZIP 解壓另有限制。固定資料夾模式不依賴瀏覽器網站資料，不會上傳雲端。單獨部署靜態匯出時仍支援 IndexedDB 模式，畫面會明確標示瀏覽器儲存，此模式受 origin 與清除網站資料影響。

隨附文件是完整可讀的指南、版本設計與格式規格，不包含商業書籍全文。來源目錄只掃描第一層，修改來源後重新載入目前會建立另一份文件，尚未自動合併為既有文件的新版本。

## 格式能力

| 格式          | 閱讀           | 筆記         | 直接編輯 | 限制                                                         |
| ------------- | -------------- | ------------ | -------- | ------------------------------------------------------------ |
| Markdown／TXT | 是             | 是           | 是       | UTF-8；不執行內嵌 HTML，不自動載入圖片                       |
| PDF           | 瀏覽器閱讀器   | 手動標記頁碼 | 尚未提供 | 閱讀器可用性依瀏覽器；頁碼書籤手動保存                       |
| EPUB          | 依章節呈現文字 | 是           | 尚未提供 | 不保留出版社排版／圖片；不支援 DRM                           |
| XLSX          | 多工作表儲存格 | 是           | 尚未提供 | 顯示原始值／公式快取，不重算公式、不保留格式；不支援舊版 XLS |

VAX 提供本機鏈式完整性驗證，未包含數位簽章或外部可信錨點。Pageforge 的差異畫面比較 VAX 版本快照；本次未修改 [VAX 倉庫](https://github.com/bnggbn/vax-action-history)。

## 開發

需 Node.js 20.19 以上與 pnpm 10.34.6，在根目錄執行：

```sh
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev:web
```

Windows PowerShell 若禁止 pnpm.ps1，改用 `pnpm.cmd`。未啟用 shim 時也可用 `corepack pnpm`。
pnpm 版本由 `packageManager` 固定，所有平台共用根目錄的 `pnpm-lock.yaml`。

```sh
pnpm build:web
pnpm start:web
# 驗證
pnpm test:web
```

`dev:web` 啟動本機書架服務（3000）與 Next 開發服務（3001），入口使用 http://localhost:3000。`start:web` 以同一入口提供正式靜態產物與書架 API；只監聽本機，不作為公開託管服務。

`test:web` 先建置，再以獨立測試瀏覽器與暫時 HTTP server 驗證匯入、保存、筆記、編輯、diff、還原、多分頁衝突、儲存失敗、刪除與版本完整性；另驗證固定資料夾、服務重開、不同瀏覽器、來源掃描與舊資料移轉。Windows 預設使用現有 Edge；其他系統需先執行 `pnpm --filter @pageforge/web exec playwright install chromium`，也可用 `PAGEFORGE_BROWSER_CHANNEL` 指定瀏覽器 channel。測試檔與截圖寫入忽略的 `.preview/`。

Desktop 需先啟動 Web，再於另一個終端執行 `pnpm dev:desktop`；打包使用 `pnpm build:all`。Desktop `file://` 下的完整文件流程尚未驗證。

Mobile 已納入 workspace，從根目錄啟動：

```sh
pnpm dev:mobile
pnpm typecheck:mobile
```

Desktop 與 Mobile 尚未串接本次 Web 文件能力。登入畫面仍是雛形；本機閱讀免登入。API 目前只有 `selfhost-api/.env.example`，未實作同步或託管。
Mobile 的共用 domain 引用、型別檢查與 Android Metro／Hermes 匯出已驗證，尚未驗證原生裝置安裝與 EAS 建置。

## 規格

- [專案定位與路線圖](docs/spec/PLAN_ZH.md)
- [Local-First 跨平台思考沙盒架構](docs/spec/LOCAL_FIRST_ARCHITECTURE.md)
- [功能與驗收](docs/spec/MVP.md)
- [資料模型與 VAX 版本](docs/spec/DATA_MODEL.md)
- [目錄與架構](docs/spec/REPO_STRUCTURE.md)
- [依賴管理](docs/spec/dependency.md)
- [待辦與已知限制](docs/spec/ISSUES.md)

預計採 MIT 授權，正式授權文件與著作權資訊待補。

## 設定

路徑、連接埠、容量限制、字級與 diff 設定集中在 `pageforge.config.json`。
本機覆寫與環境變數用法見 [設定說明](docs/CONFIGURATION.md)。
可執行 `pnpm config:check` 查看實際設定。

## 程式碼與圖片

`pnpm format` 整理縮排，`pnpm format:check` 檢查格式。
Markdown 本機圖片可放在 `library/collection/assets/`，使用相對路徑引用。
支援 PNG、JPEG、GIF、WebP；遠端圖片不自動載入。
模組分工、效能改善與圖片限制見 [架構說明](docs/ARCHITECTURE.md)。
