# Pageforge 的模組分工與效能

## 跨平台 workspace

應用程式保留 `apps/web`、`apps/mobile`、`apps/desktop` 名稱，
所有平台由 pnpm workspace 與單一鎖定檔管理。名稱不影響跨平台共用能力。
`packages/domain` 已抽出文件格式、筆記、版本與進度型別，以及格式標籤與編輯能力規則。
Web 和 Mobile 都透過 `workspace:*` 引用；Web 使用 Next 內建 `transpilePackages`。
pnpm 採 isolated 安裝，避免不同平台的 React 與其 peer 依賴互相污染。
Expo SDK 52 的 Android Metro／Hermes 匯出已驗證，原生裝置與 EAS 建置仍需另行驗證。

下一步依實際需求共用匯入／版本的純邏輯，儲存與加密能力透過平台介面接入。
Web 的 IndexedDB、Blob、DOM、PDF iframe 與 Worker 保留在 Web 層；
Mobile 需提供自己的文件存取、閱讀與儲存實作。
本機 API 仍獨立於 Next 靜態網站，供 Web 與後續桌面整合共用。
待手機有實際功能頁，再抽取 feature hooks 與共用 UI。
不預先承諾 UI 共用比例，也不為空的 `packages/app`／`packages/ui` 增加包裝層。

參考：[Next transpilePackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages)、
[Expo monorepos](https://docs.expo.dev/guides/monorepos/)、[pnpm workspace](https://pnpm.io/workspaces)。

Web 畫面透過 `lib/storage.ts` 使用儲存介面：本機服務模式連接 HTTP API，
純靜態模式使用 `indexed-storage.ts`。匯入器與閱讀器不直接操作資料夾。
共用限制由設定檔提供，本機覆寫由服務在執行時傳給前端。

## 閱讀與版本

- `ReaderWorkspace` 只組合載入／錯誤狀態與已驗證文件的 `ReaderScreen`；後者接線工具列、各模式與操作，不直接讀寫 storage 或計算 DOM 座標。
- `useReaderDocument` 負責載入、VAX 驗證、草稿恢復與跨分頁通知；載入完成後才建立閱讀畫面，過期載入結果不覆蓋目前狀態。
- `useReaderProgress` 管理閱讀位置、章節／PDF 書籤、字級、DOM refs、防抖保存與定位恢復。從編輯／歷史等模式返回時保留最後閱讀位置；文字改變才清除舊位置。
- `useReaderCommands` 管理文字／筆記／還原／採納提交與草稿整理；`useReaderNavigation` 等待草稿及進度保存後才切換、重載或返回。筆記與版本畫面分別由 `NotesPanel`、`RevisionHistory` 負責。
- `ReaderHeader`、`ReaderToolbar`、`ReaderFeedback` 與 `TextEditorPanel` 各自持有 UI 與 Tailwind；格式呈現分為 `PdfDocumentView`、`SpreadsheetView`、`TextDocumentView`，文字／表格共用 `ScrollReaderFrame` 與章節選單。
- PDF Blob URL 由 `PdfDocumentView` 建立與釋放，離開 PDF View 立即 revoke；同文件保存筆記不重新建立 URL。`useQuoteSelection` 確認選取範圍在文章內，再建立引用與位置。
- `SandboxPanel` 管理整份文字的試寫、比較與採納；`VersionDiff` 共用單欄差異呈現。
- `useWorkingCopy` 管理防抖暫存、版本 token 與恢復；主線和沙盒分別持有 session，切換前等待落盤。
- `lib/sandboxes.ts` 建立與驗證分支投影；`indexed-sandboxes.ts`、`scripts/library/sandboxes.cjs` 實作各自的原子分支保存；`browser-migration.ts` 複製沙盒與草稿，保留分歧來源。
- `DocumentContent` 負責文字排版，使用 React memo；筆記輸入與進度更新不重新解析 Markdown。
- `VirtualSheet` 只建立可見列與 overscan 列，使用固定列高、單行儲存格與完整值 tooltip；memo 隔離筆記輸入。虛擬定位介面按原始列號保存與恢復畫面外的位置。
- `reading-anchor.ts` 負責段落定位；保留段落節點清單，捲動定位採二分查找，降低 DOM 量測次數。
- `useRevisionDiff` 管理背景工作與結果生命週期；diff 在 Web Worker 執行，切換比較或離開時取消舊工作，避免舊結果覆蓋新選擇。
- 保存新版的前端請求使用增量回應，只接收已保存版本；保留已載入的原始檔，不重傳二進位與全部歷史。重新開啟仍完整載入並驗證歷史。
- 沙盒追加同樣只回傳新節點；固定資料夾草稿檢查只讀沙盒 manifest 的來源 ID，不在每次暫存讀取全部版本快照。
- `history.ts` 負責前端 VAX 建立與驗證；`scripts/library/revisions.cjs` 負責服務端保存前的驗證。
- 前端驗證以原始 Blob 與凍結的 metadata／節點物件識別重用，仍逐節點檢查順序、scope 與重複 ID。重新載入產生新物件，會完整驗證；不以相同 ID 或 SAI 就信任可變資料。
- IndexedDB v4 將原始檔／投影與獨立版本節點分離；存版只追加新節點並更新小型 metadata，草稿暫存不開啟來源／版本 store。v1–v3 升級原子移轉，失敗保留舊資料。
- 未改文字的筆記草稿只保存基準版本引用；字串容量只在文字變更後重新量測，保存狀態用物件身分追蹤，不反覆 JSON 序列化全文。
- 磁碟進度存入獨立 `progress.json`，非同步寫入與 fsync；提交前重新檢查 head，文字變更用 epoch 使舊進度失效，相容舊 manifest 的進度。
- `scripts/library-server.cjs` 協調 HTTP 路由、資料夾保存與開發代理；圖片處理由 `scripts/library/images.cjs` 負責。

原始檔、版本、筆記與進度的現有保存方式與 VAX 協定保持相容。

## Web 樣式

組件使用 Tailwind utilities，短樣式直接寫在 JSX；較長的組合以靜態字串分段，
放在同一個 TSX 檔案。`app/globals.css` 只管理主題色、字型、斷點與基礎樣式。
共用主要按鈕由 `components/ui/PrimaryButton.tsx` 管理，尺寸透過明確的 variant 選擇。
`DocumentProse` 集中管理閱讀文章的排版，子元素樣式限制在文章範圍。

封面等動態樣式使用完整 class 字串的對照表，讓 Tailwind 能在建置時辨識；
來自文件的封面顏色、閱讀字級與進度仍透過 inline style 傳入。
保留的語意 class 用於測試與組件內選取，沒有對應的全域組件 CSS。
調整響應式或互動狀態時，同時確認桌面與手機的閱讀、筆記、編輯和版本畫面。

參考：[Tailwind utility classes](https://tailwindcss.com/docs/styling-with-utility-classes)。

## 本機圖片

Markdown 使用 `![說明](assets/example.png)`，圖片放在
`library/collection/assets/example.png`。可使用子資料夾，支援 PNG、JPEG、GIF、WebP。
圖片路徑以書架 collection 根目錄為準，匯入單一 Markdown 不會自動複製旁邊的圖片。
請把相依圖片一併放進 collection。純靜態瀏覽器模式沒有這個圖片服務。

前端只產生同源的圖片 API URL。服務拒絕外部 URL、絕對路徑、上層路徑、連結檔、
SVG 與不符合點陣圖片檔頭的內容，並套用 `limits.imageMiB` 容量限制。
採延遲載入、非同步解碼、不傳 Referer，載入失敗保留圖片說明。
檔頭檢查與瀏覽器解碼各自負責格式辨識與顯示；不將圖片當作 HTML 執行。
遠端圖片不自動請求，EPUB 仍維持純文字閱讀模式。

目前圖片是 collection 中的即時資源，尚未納入 VAX 快照；改圖不會改變文字版本。
備份時必須包含 collection。下一階段可加入內容雜湊資產庫，讓圖片隨版本固定。

## 後續效能工作

`tests/performance-workflow.cjs` 以隔離合成文件檢查表格 DOM 上限、畫面外列定位、
增量驗證的雜湊資料量、筆記／進度的小型保存，以及有內容的 v3 資料庫升級與失敗回滾。
量測結果保存在忽略的 `.preview/performance-tests/`；時間受機器與負載影響，不以毫秒門檻判定 CI。
重新開啟仍下載完整主線歷史並驗證；後續可評估分頁載入。
正式版本與草稿的磁碟提交仍使用同步原子寫入，進度已獨立非同步保存。
段落定位測試以 10,000 個節點驗證每次至多 15 次量測。

## 格式化

`pnpm format` 整理 apps、packages 與 scripts 的程式碼；`pnpm format:check` 檢查。
使用兩格縮排、100 欄目標寬度。格式工具不拆字串內容，避免改變文案或協定。
產出目錄、測試暫存、書籍與 lockfile 不列入格式化。
