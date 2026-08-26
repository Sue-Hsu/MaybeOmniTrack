# GitHub Pages 免費網頁發布與上線設定教學

本指南將帶您一步步啟用 **GitHub Pages**，將 `MaybeOmniTrack` 儲存庫發布為公開可瀏覽的免費網站（支援電腦與手機隨時開啟）。

---

## 步驟一：進入 GitHub 儲存庫設定 (Settings)

1. 開啟瀏覽器，前往您的專案儲存庫頁面：
   👉 [https://github.com/Sue-Hsu/MaybeOmniTrack](https://github.com/Sue-Hsu/MaybeOmniTrack)
2. 點擊頂部選單最右側的 **「⚙️ Settings（設定）」** 標籤。

---

## 步驟二：開啟 Pages 服務

1. 在左側側邊欄中，找到 **「Code and automation（程式碼與自動化）」** 分類。
2. 點擊 **「📄 Pages」**。

---

## 步驟三：設定部署來源分支 (Build and deployment)

1. 在畫面中間的 **「Source（來源）」** 下拉選單中，確認選擇 **「Deploy from a branch」**。
2. 在下方 **「Branch（分支）」** 區塊：
   * 第一個下拉選單（目前可能是 `None`）：切換選擇 **`main`**。
   * 第二個資料夾下拉選單：保持選擇 **`/(root)`**（根目錄）。
3. 點擊右側的 **「Save（儲存）」** 按鈕。

---

## 步驟四：等待部署完成並取得專屬網址

1. 點擊儲存後，GitHub 會在背景自動觸發部屬流程（通常需等待 **1 ~ 2 分鐘**）。
2. 您可以重新整理（F5）該 Pages 頁面，上方會顯示網站已上線。
3. `MaybeFinance` 是 `MaybeOmniTrack` 的子資料夾，因此金融看板網址為：
   * **[https://sue-hsu.github.io/MaybeOmniTrack/MaybeFinance/](https://sue-hsu.github.io/MaybeOmniTrack/MaybeFinance/)**

---

## ⚠️ 重要提醒：Google 登入網域綁定

啟用 GitHub Pages 後，Google OAuth 的 JavaScript 來源仍只填網域（不可包含資料夾路徑）：
👉 `https://sue-hsu.github.io`

請記得回到 [Google Cloud Console](https://console.cloud.google.com/) 的 **「憑證」➔ 點進您的「OAuth 2.0 用戶端 ID」**：
* 在 **「已授權的 JavaScript 來源」** 確保有加入：
  * `https://sue-hsu.github.io`
* 這樣您在 GitHub Pages 線上網頁點擊 Google 登入時，才能順利通過驗證！
