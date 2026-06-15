# AIテレアポツール

社内向けテレアポ支援ツール。Excelの架電リストを取り込み、**手動モード**（自分で発信）と **AIモード**（ElevenLabsのAIが発信して会話）の2通りで架電する。詳細仕様は [DESIGN.md](DESIGN.md) を参照。

## 到達点

| 機能 | 状態 |
|---|---|
| リスト管理（Excel取込・電話番号正規化・ステータス） | ✅ 完成 |
| トークスクリプト編集 | ✅ 完成 |
| 手動モード（通話画面・結果記録／ブラウザ発信） | ✅ コード完成（ブラウザ発信はTwilio鍵で有効化） |
| 履歴・詳細（AI会話ログ表示枠込み） | ✅ 完成 |
| AIモード（発信API＋post-call webhook・署名検証） | ✅ コード完成（ElevenLabs鍵で有効化） |
| Excelエクスポート（連絡先・履歴） | ✅ 完成 |

> Twilio番号・ElevenLabsの鍵が未設定でも起動・利用できる。鍵を `.env` に入れると発信機能が自動で有効になる（コード変更不要）。

## 構成

```
AI-teleapo/
├── server/   Node.js + Express + node:sqlite (native ビルド不要)
│   └── src/  index.js / db.js / routes/ / lib/ (twilio, elevenlabs, phone, xlsxExport)
└── client/   React + Vite
    └── src/  pages/ (Contacts/History/Scripts) + components/ (CallModal/AiCallModal/CallDetailModal)
```

## セットアップ

前提: **Node.js 24 以上**（`node:sqlite` を標準同梱）。

```bash
# サーバー（ポート4000）
cd server
npm install
cp .env.example .env
npm run dev               # http://localhost:4000

# クライアント（別ターミナル, ポート5173）
cd client
npm install
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:4000 を確認
npm run dev               # http://localhost:5173
```

ブラウザで **http://localhost:5173** を開く。

> ⚠️ サーバーはポート **4000**。別プロジェクト(gakuseiouenn.net)が3000を使うため衝突回避でずらしてある。

## 今すぐ使える運用（鍵が無くても）

「手動発信」ボタン → 通話モーダルが開く →
- 電話番号をタップ（またはスマホで発信）して話す
- 画面に「使用中」トークスクリプトが表示される
- 結果（ステータス＋メモ）を記録 → 履歴に残る

つまり**Twilio番号が届く前から、スマホ運用＋記録ツールとして使える**。

## 鍵が届いたあとの結線手順

### A. 手動モードのブラウザ発信（Twilio）
1. Twilioコンソールで取得した値を `server/.env` に記入:
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`
   - `TWILIO_API_KEY` / `TWILIO_API_SECRET`（API Keys から作成）
   - `TWILIO_TWIML_APP_SID`（TwiML App を作成し、Voice の発信URLに `https://<公開URL>/twiml/voice` を設定）
   - `TWILIO_CALLER_ID`（発信者として表示する番号, +81形式）
2. ngrok等でサーバーを公開し、TwiML App の発信URLをその公開URL + `/twiml/voice` に設定。
3. サーバー再起動 → リストの「手動発信」に **「ブラウザで発信」** ボタンが出る。
   - ブラウザのマイク許可が必要（localhost か HTTPS のみ）。

### B. AIモード（ElevenLabs）
1. ElevenLabsダッシュボードでエージェントを作成（DESIGN 8章）。推奨設定:
   - TTS: **Eleven Flash v2.5**（低遅延）／ STT: **Scribe**（自動）／ LLM: **Gemini 2.5 Flash**（既定）
   - 言語: 日本語(ja)、日本語の声、システムプロンプト・初回挨拶
   - 評価設定（success criteria / data collection）で「アポ獲得」「再架電希望日時」等を定義
2. Twilio番号を ElevenLabs の Phone Numbers にインポート（Account SID + Auth Token）。`phone_number_id` を控える。
3. `server/.env` に記入:
   - `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` / `ELEVENLABS_PHONE_NUMBER_ID`
   - `ELEVENLABS_WEBHOOK_SECRET`（post-call webhook 作成時に発行される）
4. ElevenLabs の post-call webhook URL を `https://<公開URL>/webhooks/elevenlabs` に設定。
   受け取るイベント: `post_call_transcription` と `call_initiation_failure`。
5. サーバー再起動 → リストの「AI発信」が実発信になり、終了後 webhook で会話ログ・評価が履歴に入る。

### ngrok（開発時の公開URL）
```bash
ngrok http 4000
```
表示された `https://xxxx.ngrok-free.app` を Twilio / ElevenLabs の各URL設定に使う。
**ngrokを再起動するとURLが変わるので、その都度両サービスのURLを更新**すること（DESIGN 11-6）。

## 主なエンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/contacts/import?commit=false\|true` | Excel取込（false=プレビュー / true=確定） |
| GET | `/api/contacts?status=` | リスト取得 |
| GET | `/api/contacts/summary` | ステータス別件数 |
| GET | `/api/contacts/export` | 連絡先をExcel出力 |
| PATCH | `/api/contacts/:id` | ステータス・メモ更新 |
| GET | `/api/calls` | 架電履歴 |
| GET | `/api/calls/export` | 履歴をExcel出力 |
| POST | `/api/calls` | 架電結果を記録 |
| POST | `/api/calls/manual/token` | 手動発信トークン（Twilio鍵が必要、無ければ503） |
| POST | `/api/calls/ai` | AI発信（ElevenLabs鍵が必要、無ければ503） |
| GET/PUT | `/api/scripts` | 手動用トークスクリプト |
| POST | `/webhooks/elevenlabs` | post-call webhook（HMAC署名検証つき・認証の外） |
| POST | `/twiml/voice` | 手動発信用TwiML（Twilioが叩く・認証の外） |

## 補足

- DBは `server/data/app.db`（gitignore済み）。スキーマは初回起動時に自動作成。
- 電話番号はExcelの汚れ（先頭0落ち/全角/内線/科学記法）を吸収して E.164(+81) に正規化。取込は確定前にプレビュー確認できる。
- 認証は既定で無効（1台運用）。複数人化のときは `server/.env` の `AUTH_ENABLED=true` + `APP_PASSWORD` で有効化。webhook と TwiML は認証の外（DESIGN 13章）。
- AIの結果（アポ獲得/NG等）の最終確定は、履歴の詳細画面で人が行う運用（DESIGN 画面3）。
