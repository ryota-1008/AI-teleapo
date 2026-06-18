# AIテレアポツール

社内向けのテレアポ支援ツール。Excelの架電リストを取り込み、**手動モード**（自分で発信して話す）と **AIモード**（ElevenLabsのAIが電話して会話）の2通りで架電し、結果を一元管理する。相手の業種に合わせてAIのトークを出し分けられる。

- 本番URL: **https://ai-teleapo.vercel.app**
- 元の設計メモ: [DESIGN.md](DESIGN.md)（初期はExpress+SQLite想定。現在は下記スタックに移行済み）

## 技術スタック

| 層 | 採用技術 |
|---|---|
| フロント＋API | **Next.js 15（App Router）** — 画面とAPIを1アプリに統合 |
| DB | **Supabase（PostgreSQL）** を **Prisma** 経由で利用 |
| ホスティング | **Vercel**（`main` への push で自動デプロイ） |
| 音声AI | **ElevenLabs** Conversational AI（STT/LLM/TTSはElevenLabs側） |
| 電話回線 | **Twilio**（番号 + ブラウザ発信 / ElevenLabsへ番号インポート） |
| Excel | SheetJS（取込はブラウザで解析し分割送信） |

## 主な機能

- **リスト管理**: Excel取込（列マッピング確認・業種自動検出・電話番号をE.164に正規化・重複/電話なしを判定）、検索・並べ替え、手動の追加/編集/削除、Excelエクスポート
- **手動モード**: 通話画面でトークスクリプト表示＋結果記録（Twilio鍵があればブラウザ発信も）
- **AIモード**: ElevenLabsへ発信依頼 → 通話後にwebhookで会話ログ・評価を保存
- **業種別トーク**: 業種キーワード→トークを登録。AI発信時に `{{industry_pitch}}` として渡す
- **履歴**: 一覧・絞り込み・詳細（AI会話ログ/評価）、Excel出力
- **安全装置**: キルスイッチ（一時停止）と1日の架電上限

## ローカル開発

前提: Node.js 20+（推奨 22/24）、Supabaseプロジェクト。

```bash
npm install
cp .env.example .env   # 値を埋める（下表）
npx prisma migrate deploy   # 既存DBに追従（初回はテーブル作成）
npm run dev            # http://localhost:4000
```

### 環境変数（`.env` / Vercel の Environment Variables）

| 変数 | 用途 | 必須 |
|---|---|---|
| `DATABASE_URL` | Supabase 接続（Transaction pooler / 6543, `?pgbouncer=true`） | ✅ |
| `DIRECT_URL` | マイグレーション用（Session pooler / 5432） | ✅ |
| `ELEVENLABS_API_KEY` | ElevenLabs APIキー | AIモード |
| `ELEVENLABS_AGENT_ID` | 使用するエージェントID | AIモード |
| `ELEVENLABS_PHONE_NUMBER_ID` | ElevenLabsにインポートした電話番号ID | AI実発信 |
| `ELEVENLABS_WEBHOOK_SECRET` | post-call webhook 署名検証用 | AI結果保存 |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio認証 | 手動発信 |
| `TWILIO_API_KEY` / `TWILIO_API_SECRET` | Voiceトークン発行 | 手動発信 |
| `TWILIO_TWIML_APP_SID` / `TWILIO_CALLER_ID` | TwiMLアプリ / 発信者番号 | 手動発信 |
| `AUTH_ENABLED` / `APP_PASSWORD` | 簡易認証（複数人化時。既定は無効） | 任意 |

> `.env` は Git 管理外。Vercel では Settings → Environment Variables に登録 → **Redeploy** で反映。

## デプロイ

`main` に push すると Vercel が自動でビルド（`prisma generate && next build`）・デプロイする。
DBスキーマを変えた場合は `npx prisma migrate dev`（ローカルでSupabaseに適用）してから push。

## 外部サービスの結線（鍵が届いたら）

### ElevenLabs（AIモード）
1. ダッシュボードでエージェント作成（言語ja / 声 / TTS=Flash v2.5 / LLM=Gemini 2.5 Flash）
2. プロンプトに `{{company}} {{person}} {{industry}} {{industry_pitch}}` を入れる
3. `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` を環境変数に
4. Twilio番号をElevenLabsにインポート → `ELEVENLABS_PHONE_NUMBER_ID` を環境変数に
5. post-call webhook を `https://ai-teleapo.vercel.app/api/webhooks/elevenlabs` に設定し、`ELEVENLABS_WEBHOOK_SECRET` を環境変数に（受けるイベント: `post_call_transcription`, `call_initiation_failure`）

### Twilio（手動モード）
- TwiML App の発信URLを `https://ai-teleapo.vercel.app/api/twiml/voice` に設定し、上表のTwilio系変数を埋める

## ディレクトリ構成

```
app/
  page.jsx              画面のタブ切替（リスト/履歴/スクリプト/業種トーク/設定）
  layout.jsx, globals.css
  api/                  すべてのAPIルート(contacts/calls/scripts/settings/
                        industry-pitches/webhooks/twiml/twilio)
components/             画面・モーダル（client components）
lib/                    db(Prisma) / phone / twilio / elevenlabs / xlsxExport /
                        importMapping / guard / apiClient / prisma
prisma/                 schema.prisma + migrations
middleware.js           認証の箱（既定オフ。webhook/twimlは対象外）
```

## 補足

- 取込は**ブラウザでExcelを解析→500件ずつ送信**（Vercelの4.5MB制限を回避）。大きな法人リスト（数万件）も取り込める。
- 電話番号は先頭0落ち/全角/科学記法/内線などを吸収してE.164(+81)へ。
- AIの結果（アポ獲得/再架電希望日時など）の最終確定は履歴の詳細画面で人が行う運用。
