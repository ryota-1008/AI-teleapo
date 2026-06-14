# AIテレアポツール

社内向けテレアポ支援ツール。詳細仕様は [DESIGN.md](DESIGN.md) を参照。

現在の到達点: **Phase 1 のうち外部アカウント不要の部分**（リスト管理 + Excel取込 + リスト画面）。
手動モード(Twilio)・AIモード(ElevenLabs)は雛形のみ（API取得後に実装）。

## 構成

```
AI-teleapo/
├── server/   Node.js + Express + node:sqlite (native ビルド不要)
└── client/   React + Vite
```

## セットアップ

前提: Node.js 24 以上（`node:sqlite` を標準同梱）。

```bash
# サーバー
cd server
npm install
cp .env.example .env      # 必要に応じて編集
npm run dev               # http://localhost:3000

# クライアント（別ターミナル）
cd client
npm install
cp .env.example .env      # VITE_API_BASE_URL を確認
npm run dev               # http://localhost:5173
```

ブラウザで http://localhost:5173 を開く。

## 実装済みエンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/contacts/import?commit=false\|true` | Excel取込（false=プレビュー / true=確定） |
| GET | `/api/contacts?status=` | リスト取得 |
| GET | `/api/contacts/summary` | ステータス別件数 |
| PATCH | `/api/contacts/:id` | ステータス・メモ更新 |
| GET | `/api/calls` | 架電履歴 |
| PATCH | `/api/calls/:id` | 結果確定 |
| GET/PUT | `/api/scripts` | 手動用トークスクリプト |
| POST | `/api/calls/manual/token` | （未実装）手動発信トークン — Phase 1 |
| POST | `/api/calls/ai` | （未実装）AI発信 — Phase 2 |
| POST | `/webhooks/elevenlabs` | （雛形）post-call webhook — Phase 2 |

## 補足

- DBは `server/data/app.db`（gitignore 済み）。スキーマは初回起動時に自動作成。
- 電話番号はExcelの汚れ（先頭0落ち/全角/内線/科学記法）を吸収して E.164(+81) に正規化する。
- 認証は既定で無効（1台運用）。複数人化のときは `.env` の `AUTH_ENABLED=true` + `APP_PASSWORD` で有効化（DESIGN 13章）。
