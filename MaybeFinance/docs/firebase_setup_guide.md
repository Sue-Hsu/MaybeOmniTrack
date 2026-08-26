# Firebase 機密保險庫：免費建立與設定教學

本教學將引導您在 **Firebase（Google 提供的免費雲端後台）** 建立專屬的「機密保險庫」，用來存放您的 **Supabase API Key、特定帳號密碼、GoldAPI Key**。

這樣一來，無論您在世界上的哪一台電腦或手機打開網頁，**只要點擊 Google 登入，系統就會自動從 Firebase 調用 Supabase 金鑰**，達到真正的跨裝置無縫同步！

---

## 步驟一：建立 Firebase 專案

1. 開啟瀏覽器，前往 [Firebase 控制台 (Firebase Console)](https://console.firebase.google.com/)。
2. 登入您的 Google 帳號，點擊 **「建立專案」**（或「新增專案」）。
3. 輸入專案名稱（例如：`MaybeOmniTrack`），點擊繼續。
4. Google Analytics（分析）可以選擇關閉或開啟，點擊 **「建立專案」**。
5. 等待幾秒建立完成後，點擊 **「繼續」** 進入專案首頁。

---

## 步驟二：啟用 Firestore 資料庫

1. 在 Firebase 左側選單中，點擊 **「建構 (Build)」➔「Firestore Database」**。
2. 點擊 **「建立資料庫 (Create database)」**。
3. 位置保持預設（例如 `asia-east1 (台灣)` 或預設地區），點擊下一步。
4. 安全性規則選擇 **「以測試模式啟動 (Start in test mode)」**（方便讀寫），點擊 **「啟用 (Enable)」**。

---

## 步驟三：取得網頁版連線設定 (Firebase Web Config)

1. 在 Firebase 左側頂部，點擊齒輪圖示 **「專案設定 (Project settings)」**。
2. 在「一般 (General)」分頁往下滑，找到 **「您的應用程式 (Your apps)」** 區塊。
3. 點擊網頁圖示 **`</>`（Web 應用程式）**。
4. 輸入應用程式暱稱（例如 `MaybeOmniTrack-Web`），**不用勾選** Firebase Hosting，點擊 **「註冊應用程式」**。
5. 畫面會顯示一段包含 `firebaseConfig` 的程式碼，格式類似如下：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "maybeomnitrack-xxxx.firebaseapp.com",
  projectId: "maybeomnitrack-xxxx",
  storageBucket: "maybeomnitrack-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:xxxxxxxxxxxxxxxxx"
};
```

---

## 步驟四：在網頁後台填入設定

1. 打開您的金融看板網頁 [`W:\Source2\MaybeFinance\index.html`](file:///W:/Source2/MaybeFinance/index.html) 或 GitHub Pages。
2. 點擊右上角 **「登入 / 連線」** ➔ 選擇 **「Google 登入」**。
3. 登入後點擊右上角 **「⚙️ 後台設定」**。
4. 填寫您的：
   * **特定帳號/密碼**（選用；系統不提供公開預設密碼，若啟用必須設定非空密碼）
   * **Supabase Project URL 與 Anon Key**
   * **Firebase Web Config**（直接將步驟三複製的整段 `{ ... }` 貼進框內）。
5. 點擊 **「儲存所有雲端設定」**！

🎉 **大功告成！**
現在，Supabase 的金鑰與特定帳密已經安全保存在您的 Firebase 專案中。當您換到手機或其他電腦打開網頁時，登入 Google 就會自動抓取金鑰連上 Supabase！
