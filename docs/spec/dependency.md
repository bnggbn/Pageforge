# 依賴管理

## 現有設定

版本範圍取自各 `package.json`；實際安裝版本以 lockfile 為準。

| 範圍 | 主要依賴 |
| --- | --- |
| 根目錄 | pnpm 10.34.6 workspace、concurrently、Prettier；本機服務直接宣告 vax-sdk |
| Web | Next.js ^15.1.7、React ^19、Tailwind ^4.2.1、react-markdown ^10.1.0、remark-gfm ^4 |
| Desktop | Electron ^34、electron-builder ^25.1.8 |
| Mobile | Expo ~52、React 18.3.1、React Native 0.76.5、NativeWind ^4.2.2、Tailwind ^3.4.19 |
| SDK | vax-sdk 1.0.0 |
| Web 格式／版本 | fflate、buffer、vax-sdk 1.0.0、diff；版本以 lockfile 為準 |
| Web 測試 | Playwright，Windows 預設使用現有 Edge |

## 管理方式

- 所有 apps、packages 與 core 都納入 `pnpm-workspace.yaml`。
- 只有根目錄的 `pnpm-lock.yaml`，安裝使用 `pnpm install --frozen-lockfile`。
- `packageManager` 固定 pnpm 10.34.6；Node 需 20.19 以上。
- 共用文件型別與格式規則在 `packages/domain`，使用 `workspace:*` 引用。
- Web 透過 Next 內建 `transpilePackages` 編譯共用套件。
- 採 isolated 安裝，隔離 Next／React 19 與 Expo／React 18 的完整依賴圖，不強制 override。
- Expo Router 4 未宣告其實際引用的 query-string，使用 packageExtensions 補齊依賴。
- Expo SDK 52 的 Metro 匯出納入驗證，原生裝置建置另行驗證；日後升級 Expo 再確認原生安裝支援。
- 安裝腳本 allowlist 僅包含 Electron、sharp、esbuild；新增前需確認用途。
- 升級依賴時確認官方相容性說明，執行受影響平台的型別檢查與建置。
- Web 已直接使用 vax-sdk 的 JCS、genesis 與 SAI 介面，buffer 提供瀏覽器相容性；packages/sdk 仍只有套件宣告。

平台驗證使用 Web 正式建置與瀏覽器流程、Desktop TypeScript 編譯，以及 Mobile 型別檢查與 Metro 匯出。
桌面封裝後的 file:// 文件流程、Android／iOS 裝置行為仍需另外驗證。
