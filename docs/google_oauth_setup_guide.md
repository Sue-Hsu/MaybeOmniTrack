# Google OAuth 2.0 Client ID 申請與設定完整教學

本指南將帶您一步步在 **Google Cloud Console** 申請 Google 登入專用的 **OAuth Client ID**，並設定允許的網域（包含本機測試與 GitHub Pages）。

---

## 步驟一：進入 Google Cloud Console 並建立專案

1. 開啟瀏覽器，前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 使用您的 Google 帳號登入。
3. 點擊頂部導航列的**「選取專案」**（或專案下拉選單）➔ 點擊右上角的**「新增專案」**。
4. 輸入專案名稱（例如：`MaybeFinance-App`）➔ 點擊**「建立」**。
5. 建立完成後，確認頂部專案選單已切換至剛剛建立的專案。

---

## 步驟二：設定 OAuth 同意畫面 (OAuth Consent Screen)

在建立 Client ID 之前，必須先設定同意畫面：

1. 點擊左側選單（三條線圖示）➔ **「API 和服務」** ➔ **「OAuth 同意畫面」**。
2. **User Type（使用者類型）**：選擇 **「外部 (External)」** ➔ 點擊**「建立」**。
3. **應用程式資訊**：
   * **應用程式名稱**：輸入 `財務白癡救星`（或自訂名稱）。
   * **使用者支援電子郵件**：選擇您的 Gmail。
   * **開發人員聯絡資訊**：填入您的 Email。
4. 其餘欄位可先留空，直接點擊底部的**「儲存並繼續」**。
5. **範圍 (Scopes)**：直接點擊**「儲存並繼續」**（預設已有基本 profile 與 email 權限）。
6. **測試使用者 (Test Users)**：
   * 點擊**「+ ADD USERS」**，把您自己的 Gmail 帳號加進去（此階段在測試模式下，只有名單內的帳號可以登入）。
   * 點擊**「儲存並繼續」** ➔ 最後點擊**「返回資訊主頁」**。

---

## 步驟三：建立 OAuth 2.0 用戶端 ID (Client ID)

1. 點擊左側選單的**「憑證 (Credentials)」**。
2. 點擊上方**「+ 建立憑證 (+ CREATE CREDENTIALS)」** ➔ 選擇 **「OAuth 用戶端 ID」**。
3. **應用程式類型**：選擇 **「網頁應用程式 (Web application)」**。
4. **名稱**：輸入 `MaybeFinance-Web`。
5. **已授權的 JavaScript 來源 (Authorized JavaScript origins)** ⚠️【最重要步驟】：
   * 點擊 **「+ 新增 URI (+ ADD URI)」**，依序新增以下網址（注意不要以斜線 `/` 結尾）：
     * `http://localhost` （本機測試）
     * `http://localhost:5500` （若使用 VS Code Live Server）
     * `http://127.0.0.1:5500`
     * `http://127.0.0.1`
     * `https://<您的GitHub帳號>.github.io` （未來 GitHub Pages 部署網址，例如 `https://kilin.github.io`）
6. **已授權的重新導向 URI (Authorized redirect URIs)**：
   * 同樣新增上述網址，若使用 Firebase Auth 或 Supabase Auth，亦可在此填入它們提供的 redirect url（例如 `https://<專案ID>.firebaseapp.com/__/auth/handler` 或 `https://<專案ID>.supabase.co/auth/v1/callback`）。
7. 點擊**「建立 (CREATE)」**。

---

## 步驟四：取得您的 Client ID

建立完成後，畫面會跳出彈窗顯示：
* **您的用戶端 ID (Client ID)**：長得像 `xxxxxxxxxx-xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`。
* **用戶端密碼 (Client Secret)**：（純前端 Google Sign-In 通常只需 Client ID）。

請複製這串 **Client ID**，稍後我們可以直接填入網頁的管理者後台設定中！
