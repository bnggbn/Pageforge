# 本機文件與版本模型

目前實作位於 `apps/web/lib/`，固定資料夾服務在 `scripts/library-server.cjs`。預設使用硬碟書架，單獨靜態部署使用 IndexedDB `pageforge-library`（schema version 2，原子升級舊資料庫）作為另一種模式。

後續 Hash／DAG、Fork／Adopt、Temp Branch、雲端內容定址儲存與獨立會話鏈，見
[Local-First 架構提案](LOCAL_FIRST_ARCHITECTURE.md)。提案中的節點欄位尚未取代以下實作；
正式導入前需另定資料 schema、舊版本遷移、主線 head 比對與同步合約。

## 固定資料夾儲存

`library/books/{id}/original.{ext}` 保存原始位元組；`versions/{revision-id}.json` 保存不可覆寫的版本快照。`manifest.json` 是原子更新的版本順序、文件投影與進度紀錄。寫入使用暫存檔、fsync 與 rename；版本快照先寫入，成功切換 manifest 才對讀取者可見。失敗可能留下未引用的版本／暫存檔，但不會顯示保存成功或改動有效 head。

儲存先驗證 VAX 事件，再次比對目前 head，拒絕並行覆寫。匯入先完成來源與版本目錄，再 rename 成有效文件資料夾。刪除整個資料夾移到 library/.trash/，不會再出現在有效書架。

`library/collection/` 為待匯入來源，按需掃描第一層檔案。首次載入完成記錄在 `.pageforge/settings.json`，清空書架不會自動補回範例。

同一 library 只允許一個服務程序。API 只監聽 127.0.0.1，限制本機 Host／Origin，不接受網頁提供任意硬碟路徑。關閉服務後，可複製整個 library 備份。

## 瀏覽器模式儲存

- `documents`：原始 Blob、文件格式與標題、EPUB 章節／XLSX 工作表投影、VAX genesis 與完整版本快照。
- `summaries`：不含內容的書架摘要與顯示進度；`[format, originalHash]` 為唯一索引，阻止並行重複匯入。
- `progress`：文件 ID、版本 ID、穩定區塊標記、區塊內比例、百分比、章節／工作表或 PDF 頁碼。
- `settings`：閱讀字級。
- `drafts`：以 UUID 區分工作草稿，依 documentId 建立索引；版本 token 防止另一分頁覆寫。

文件與摘要在同一 transaction 建立；刪除文件、摘要與進度也在同一 transaction 完成。每次版本儲存先比對預期 head，再原子追加版本與更新摘要。另一分頁已修改／刪除時拒絕覆寫，編輯器保留未保存文字。

## 原始檔與投影

原始檔保存匯入時的位元組與 SHA-256。文字格式建立可編輯文字；EPUB 依 spine 解出純文字章節，XLSX 讀取工作表與儲存格快取值。原始二進位檔不覆寫。

## 版本快照

每個版本保存：UUID、parent revision ID、事件種類、UTC 建立時間、文字快照、筆記快照、prevSAI、SAI、JCS canonical SAE。

事件種類為 `import`／`edit`／`note`／`restore`。文字編輯與筆記操作都新增版本；還原指定舊快照也建立新版本，舊歷史保留。

SAE 的 `sdto` 包含文件 ID、版本 ID、父版本 ID、原始檔 hash、文字 hash、筆記 hash、文件投影 hash，以及還原來源 ID。投影 hash 涵蓋標題、原始檔名、格式、章節與工作表資料。

使用既有 `vax-sdk 1.0.0` 的 JCS、genesis 與 SAI 實作。每份文件有獨立 actor／salt／genesis，開啟時檢查原始檔、快照內容與鏈結。此驗證沒有簽章或外部可信 head，因此不宣稱能抵抗本機整條鏈重寫或尾端截斷。

版本 diff 使用 jsdiff 比較兩個已保存快照的文字或筆記，限制輸入總長度 1 MiB、執行時間與 edit length。超過限制提示匯出後外部比較。此功能屬於 Pageforge，不修改 VAX 上游。

## 位置與筆記

Markdown 區塊使用來源行號，TXT／EPUB 使用段落索引，XLSX 使用列索引。區塊內以比例保存位置，調整字級後按新高度恢復。內容改變時清除舊進度；只有筆記改變時可沿用相同文字的位置。

PDF 不讀取內建閱讀器的捲動事件，使用手動保存的頁碼書籤，不顯示猜測的百分比。EPUB／XLSX 保存章節／工作表選擇，百分比按區段等權重計算。

筆記包含 ID、文字、引用、位置標記與 UTC 時間。引用與位置是建立時的文字紀錄，尚未自動重定位到修改後原文。

多分頁進度採最後成功提交值，但必須仍指向目前 head；文件已刪除時拒絕寫回。版本修改透過 BroadcastChannel 通知其他分頁，自身的保存不觸發過期提示。

## 工作草稿

文字與未提交筆記分開於正式版本保存。每份草稿含 ID、文件 ID、基準版本 ID、
版本 token、文字、筆記內文／引用／位置與 UTC 更新時間。
固定資料夾儲存在 `library/books/{id}/drafts/{draft-id}.json`，使用暫存檔、fsync 與 rename。
瀏覽器模式在檢查文件仍存在的同一 transaction 寫入 drafts。

暫存採 `reading.draftDebounceMs`；切換模式或返回書架先等待成功落盤。
寫入失敗保留輸入並阻止切換。兩個分頁恢復同一草稿後，過期 token 的寫入另建草稿，
不覆蓋先前寫入；使用者可選取保留的草稿。
基準版本比主線舊時明確提示，正式版本提交仍檢查主線 head。

保存筆記保留尚未提交的文字。正式提交後整理自己的草稿；整理失敗時保留復原副本並提示。
捨棄草稿只刪除 token 相符的那份；刪除文件同步移除草稿（固定資料夾隨文件移到垃圾區）。
每份文件的草稿上限由 `limits.workingCopyCount` 設定，不自動按期限清除。
瀏覽器關閉前若還有尚未落盤的輸入，保留原生離開提醒；無法保證系統強制終止前的最後按鍵已保存。

## 匯出

可下載原始檔、匯出目前 Markdown／TXT，以及輸出 `pageforge-history/1` 的歷史 JSON。JSON 不包含二進位原始檔與閱讀位置，尚無完整備份封裝與還原匯入；固定資料夾模式可在關閉服務後直接複製 library 備份。
