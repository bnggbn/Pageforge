# Local-First 跨平台文件與思考沙盒架構

狀態：目標架構規格，包含尚未實作的後續能力。

本文件收錄使用者提供的完整架構提案，作為 Pageforge 的後續設計方向。
現有功能與驗收仍以 [MVP](MVP.md) 為準；目前保存方式與 VAX 協定見
[資料模型](DATA_MODEL.md)，平台分工見 [目錄與架構](REPO_STRUCTURE.md)。
開發順序見 [專案計劃](PLAN_ZH.md)，尚未完成的項目見 [待辦](ISSUES.md)。

## 現況與目標

| 能力         | 目前實作                                               | 本提案目標                                                          |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| 跨平台核心   | pnpm workspace；Web／Mobile 共用 domain 型別與格式規則 | 各端共用 TypeScript 版本、差異、沙盒與暫存邏輯，平台提供儲存介面    |
| 版本與差異   | VAX 線性版本鏈、文字／筆記 inline diff、還原成新版本   | Hash／DAG 分支、Fork／Adopt、單欄與雙欄比較                         |
| 草稿與衝突   | 離開未保存編輯需確認；並行 head 衝突阻擋覆寫           | 持久化靜默暫存、草稿自動還原、衝突保留為平行分支                    |
| 持久化與同步 | 固定 library/；純靜態模式使用 IndexedDB                | 保留本機持久化，選用內容定址的雲端物件儲存與離線同步                |
| 身分與稽核   | 本機免登入；登入畫面尚未串接；無獨立會話事件鏈         | Identity Bridge、供應商登入、短效 token 與獨立 append-only 操作軌跡 |

## 與既有規格的銜接

- 本機閱讀、編輯與保存不依賴登入或雲端。下列提案的「全數存於雲端」指啟用同步後的雲端副本；上傳仍須取得使用者同意。
- 新的 Hash／DAG 節點欄位是目標模型，不直接取代現有 revision ID、prevSAI、SAI 與 SAE；導入前另定 schema、遷移與舊歷史驗證方式。
- Adopt 與舊版本還原都建立新主線版本，保留既有歷史，並記錄沙盒來源。主線已變更時先保留雙方，再重新比較與選擇，不能直接繞過 head 比對。
- Temp Branch 的「短效」是介面與生命週期概念；未採納的草稿需先成功持久化才能切換，清理期限與復原規則另定。
- 「零營運成本」與「100% 邏輯跨平台覆蓋」是提案目標，實際成本與共用範圍需以平台實作驗證；Serverless／Edge 指雲端服務層。
- Identity Bridge 的供應商登入協定、PKCE 責任分界、各端回呼與 token 生命週期，需在登入實作規格中確認。
- 以 Hash 命名是內容定址規則；不可變寫入、讀取驗證與存取權限需由儲存合約落實。

## 技術可行性評估（2026-10-02）

方法：檢查目前 Pageforge 程式、已安裝的 vax-sdk 1.0.0 原始碼與供應商官方文件。
結論：核心文件沙盒可行；完整提案需要分階段實作，部分技術敘述需修正。
本評估是程式與合約層面的可行性判斷，尚未驗證新的分支模型、原生裝置登入或雲端同步部署。
以下評估與修正優先於原始提案中尚未驗證的技術敘述。

| 項目                | 判斷與現有依據                                                                                    | 必要工作                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Fork／Adopt         | 可行。現有快照與 VAX hash primitives 可沿用，但 `history.ts`、服務端驗證與儲存都假定單一線性 head | 新增 branch／base／head 與採納來源模型、分支驗證、schema 遷移和原子 head 更新                        |
| 視覺 Diff           | 可行。文字／筆記逐行 diff 已在 Web Worker 執行                                                    | 補雙欄視圖；段落採納需穩定區塊 ID 與來源版本，不能只沿用目前的行號定位                               |
| 靜默暫存            | 可行。現有儲存已有原子保存機制，但草稿目前仍只在 React state                                      | 新增獨立持久化 draft store、恢復與保存失敗狀態；切換成功以草稿落盤為前提                             |
| 離線多端同步        | 可行，是主要新增工程。現有 CAS 能拒絕衝突，尚無 outbox 或保留衝突分支                             | 補重試、冪等提交、缺少物件補傳、衝突分支、刪除標記與中斷恢復                                         |
| 跨平台核心          | 純資料與演算法可共用；目前僅 domain 型別與格式規則已共用                                          | 儲存、檔案、crypto、背景 diff 與 UI 維持平台介面；vax-sdk 的 Buffer／Web Crypto 依賴需做相容性驗證   |
| 雲端與登入          | 服務層可採 Edge／Serverless；現有 Node 檔案服務不能直接搬到 Worker                                | 新增物件儲存與索引實作、登入橋接、各端回傳登入結果的流程，以及必要的服務端驗證                       |
| Session Audit Trail | 可做獨立 append-only 操作鏈                                                                       | 另定事件種類、留存與授權；若要宣稱合規或可對外證明，還需可信錨點／簽章等機制，僅本機 hash chain 不足 |

### 必須修正的架構假設

- **KV 不能獨自負責主線 head 的原子更新。** Workers KV 採最終一致性，不適合需要交易的讀改寫；主線、權限與提交一致性建議由 Durable Object 的交易式儲存處理。若只更新單一 manifest，可另驗證 R2 的條件寫入方案；KV 作為可重建的快取或索引投影。[KV 一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/)、[Durable Object 儲存](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)、[R2 條件寫入](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations)。
- **Google 與 GitHub 的使用者登入不能共用同一個外部 OIDC 假設。** Google 提供 OIDC；GitHub 使用者登入應接 OAuth 授權流程與使用者 API，再由 Bridge 統一內部身分。Bridge 能集中外部回呼，但各端仍需取得登入結果，不能省略 App 回呼或另一個受驗證的交接流程。[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect)、[GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[原生登入回呼](https://developers.google.com/identity/protocols/oauth2/native-app)。
- **Client-Heavy 不代表服務端只收資料而不驗證。** 客戶端可先算 hash 與 diff；服務端仍需驗證身分、文件權限、提交大小、內容與 hash 的關聯，以及預期 head。現有本機服務已有版本驗證，雲端實作需保留這些責任。
- **免手動 Merge 是可行的 UX 選擇，不能消除分歧。** 自動保留分支可以避免寫入衝突使工作中斷；兩端修改同一段時仍需使用者比較後選擇。採納不能在主線已前進時默默覆蓋另一端的工作。
- **$0 與極輕量需有條件。** R2 有免費額度與超量計費，不能保證長期零費用；雲端版本數、容量與操作次數需設定限制。Desktop／Mobile 的安裝大小、記憶體、啟動與大型文件操作仍需實測，不以框架或共用比例推定。[R2 計費](https://developers.cloudflare.com/r2/pricing/)、[Electron 效能量測](https://www.electronjs.org/docs/latest/tutorial/performance)。

### 建議實作與驗證順序

1. 本機持久化草稿與切換恢復：驗證重啟、保存失敗、多分頁與文件刪除後的草稿處置。
2. 整份文字文件的 Fork／Diff／Adopt：保留 VAX primitives，驗證分支來源、採納來源、過期 head 與舊版本遷移；章節／段落 Fork 待穩定區塊模型後加入。
3. 共用版本核心與平台介面：先接 Desktop 本機儲存，再驗證 Mobile 的相同事件輸入產生相同 canonical bytes 與 SAI。
4. 可選登入與雲端同步：以兩個離線客戶端同時修改、重複提交、上傳中斷及恢復作為驗收；最後接上獨立會話事件鏈。

以下保留原始架構提案全文。

---

## 系統架構設計總覽：Local-First 跨平台 Git-like 文件與思考沙盒編輯器

本系統旨在打造一款以「思考與創作實驗沙盒」為核心的極輕量、跨平台文件閱讀與編輯工具。透過將 Git 的不可變數據結構（Immutable Data Structure）與 Local-First 理念相結合，系統在完全屏蔽傳統 Merge 複雜度與 CLI 門檻的前提下，提供零心理負擔的文字試驗環境。

---

### 一、 核心設計哲學與約束條件

1. **Local-First & Client-Heavy**：計算（Hash 計算、Diff 比對、DAG 樹狀維護）盡可能在客戶端完成，伺服器僅作為持久化儲存與同步中介。
2. **零營運成本（$0 Cost Infrastructure）**：不維護重型關聯式資料庫，極小化後端運算資源，全站組件皆可部署於 Serverless / Edge 平台（如 Cloudflare Workers + R2）。
3. **無痛 Fork，拒絕手動 Merge**：以「平行宇宙探索」取代「衝突合併」，消除 Merge Conflict 帶來的 UX 斷層。
4. **極致流暢度（Flow State Focus）**：靜默暫存、無感切換，防止跳窗破壞創作思緒。

---

### 二、 整體系統架構圖

```
┌────────────────────────────────────────────────────────────────────────┐
│                        客戶端 (Multi-Platform Client)                   │
│  [ React Native (iOS / Android) ]    [ Electron (Windows / macOS) ]  │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Client Engine (TypeScript Core)                                │   │
│   │ ├─ Hash / DAG Chain Manager (Git-like Revision Engine)          │   │
│   │ ├─ Diff Engine & Sandbox Verification (Fork / Adopt)          │   │
│   │ └─ Silent Auto-Stash Handler (Temp Branch Management)          │   │
│   └────────────────────────────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │ OIDC Tokens (PKCE)               │ Signed URLs / Object Keys
                   ▼                                  ▼
┌─────────────────────────────────────┐  ┌────────────────────────────────┐
│ Identity Bridge / Proxy (Edge Workers)│  │ Cloud Object Storage (R2 / S3) │
│ ├─ Federated OIDC (Google/GitHub RP)│  │ ├─ Immutable Content Blobs     │
│ └─ Lightweight Session KV Store     │  │ │  (Key = SHA-256 Content Hash) │
└─────────────────────────────────────┘  └────────────────────────────────┘

```

---

### 三、 模組化技術選型與架構細節

#### 1. 客戶端層 (Client Layer)

- **跨平台框架**：React Native (Mobile) + Electron (Desktop) + Web (SPA)。共用核心 TypeScript 業務邏輯，達成 100% 邏輯跨平台覆蓋。
- **版本控制引擎**：在前端實現 Hash-Chain / DAG 計算。
- 每個文檔修改均生成不可變快照（Node）。
- 節點數據結構包含：`hash`, `prev_hash`, `timestamp`, `author_id`, `content_blob_key`, `metadata`。

#### 2. 編輯與版本 UX 策略 (Fork / Diff / Temp Branch)

- **Fork & Adopt 機制**：
- 使用者可對任意章節/段落隨時 `Fork` 開啟平行宇宙。
- 驗證失敗即可直接棄置；驗證成功則點擊 `Adopt（採納）`，將內容替換為當前主線 Head，並生成新 Hash 節點接回鏈條。

- **一鍵可視化 Diff 比對**：衝突或版次比對採用單欄內聯高亮（Inline Diff）或 Side-by-Side 雙欄視圖，摒棄傳統 Git 標籤（如 `<<<<<<< HEAD`）。
- **無感暫存（Temp Branching）**：
- 當切換分支且存在未提交變更（Dirty State）時，系統靜默建立短效臨時分支（如 `_temp/stash-{timestamp}`），不跳出「確定要離開嗎」之彈窗。
- 切回時自動還原草稿，確保創作流暢度（Flow State）。

#### 3. 身分驗證與授權 (Identity Bridge / OIDC Proxy)

- **架構定位**：輕量化 Identity Broker，扮演內部各端（RP）與外部權威 IdP 間的轉接頭。
- **運作流程**：

1. 客戶端（RN / Electron）經由系統預設瀏覽器發起 Auth 請求。
2. Identity Bridge 代理轉向 Google / GitHub OIDC Provider。
3. 驗證完成後，Bridge 統一處理 Token 發放與 PKCE 驗證，並派發內部短效 JWT。

- **優勢**：免去全平台（Universal Links / Protocol Handlers）於外部平台重複設定多組 Redirect URI 的痛苦，且本機端無須儲存任何使用者密碼。

#### 4. 資料持久化與儲存策略 (Persistence & Storage)

- **文檔內容（Blobs）**：全數存於雲端物件儲存（Cloudflare R2 / AWS S3）。
- 檔案以內容 Hash 命名（Content-addressable storage），天然具備不可變（Immutable）與唯讀特性。
- 客戶端直接持 Bridge 簽發之預簽署 URL（Signed URL）向 CDN/S3 上傳或拉取純文字/JSON 檔，後端完全無需負擔流量轉發。

- **索引與元數據（Index & Meta）**：
  *僅在輕量 KV Store（如 Cloudflare KV 或 SQLite）儲存 Hash 關係鏈與帳號存取權限。
- 系統資料庫體積縮減至極致，維護成本趨近於零。

#### 5. 稽核與會話軌跡 (Session Audit Trail)

- **職責分離（Decoupling）**：文檔內容歷史與使用者操作軌跡分離。
- **會話鏈條（Session Chain）**：針對合規或留存證據需求，使用者會話（Session）與留言操作會以 Append-Only 事件鏈型態獨立儲存，避免污染主文檔之 Hash-Chain。

---

### 四、 關鍵工作流程 (Key Workflows)

#### 1. 分支實驗與無痛採納 (Fork & Adopt Flow)

```
[ Main Branch: Hash-A ]
       │
       ├─────────────────────────────────┐ (靜默生成新節點)
       ▼                                 ▼
[ Main: Hash-A ]               [ Sandbox Fork: Hash-B ]
 (主線保持乾淨)                    (隨意改寫、實驗、驗證)
                                         │
                                         ├─ 驗證失敗 ──> 直接丟棄 Fork
                                         │
                                         └─ 驗證成功 ──> 點擊 [Adopt]
                                                             │
                                                             ▼
                                                   [ Main: Hash-C ]
                                              (Hash-B 內容接回成為新 Head)

```

#### 2. 離線同步與衝突處置 (Silent Conflict Resolution)

```
  [ 手機端恢復連線 ]
         │
         ▼
[ 檢測 prev_hash 對不上 ]
         │
         ├─ 不拋出 Error，不覆蓋資料
         ▼
[ 背景靜默 Fork 新節點 ]
         │
         ▼
[ UI 提示：「檢測到來自手機的變更」 ]
         │
         ▼
[ 使用者開啟可視化 Diff 比對 ] ──> 點選 [覆蓋主線] 或 [保留雙方] ──> 自動計算新 Hash 接回

```

---

### 五、 總結與架構優勢分析

此系統架構精準實現了工程嚴謹度與產品體驗間的平衡：

- **對開發者（一人營運）**：完全免除資料庫維護成本（無重型 DB）、免除伺服器運算與頻寬壓力（S3 直連 + Client 端運算），且跨平台代碼高度複用。
- **對使用者（思考創作者）**：獲得如 Git 般堅固的資料安全性與歷史追蹤能力，同時免受 Git CLI 命令、衝突解決與繁雜選項的困擾，達成「低摩擦、敢嘗試、不掉資料」的純淨寫作環境。
