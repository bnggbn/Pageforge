# 依賴管理

## 現有設定

版本範圍取自各 `package.json`；實際安裝版本以 lockfile 為準。

| 範圍 | 主要依賴 |
| --- | --- |
| 根目錄 | npm workspaces、concurrently ^9.1.2 |
| Web | Next.js ^15.1.7、React ^19、Tailwind ^4.2.1、react-markdown ^10.1.0、remark-gfm ^4 |
| Desktop | Electron ^34、electron-builder ^25.1.8 |
| Mobile | Expo ~52、React 18.3.1、React Native 0.76.5、NativeWind ^4.2.2、Tailwind ^3.4.19 |
| SDK | vax-sdk 1.0.0 |
| Web 格式／版本 | fflate、buffer、vax-sdk 1.0.0、diff；版本以 lockfile 為準 |
| Web 測試 | Playwright，Windows 預設使用現有 Edge |

## 管理方式

- Web、Desktop、packages 與 core 使用根目錄 workspace。
- Mobile 目前獨立管理；根目錄指令轉到 `apps/mobile` 啟動。
- 根目錄已有 `package-lock.json`，安裝使用 `npm ci`。
- Mobile 建立自己的 lockfile 後，固定使用 `npm ci`。
- Node 與 npm 版本尚未固定，設定開發環境時補上。
- 升級依賴時確認官方相容性說明，執行受影響平台的型別檢查與建置。
- Web 已直接使用 vax-sdk 的 JCS、genesis 與 SAI 介面，buffer 提供瀏覽器相容性；packages/sdk 仍只有套件宣告。

本次 Web 已完成型別檢查、正式建置與瀏覽器完整流程驗證；Desktop／Mobile 尚未驗證。
