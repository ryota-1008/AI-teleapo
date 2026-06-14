# AIテレアポツール 全体設計書(v2: ElevenLabs Agents対応版)

> このドキュメントはClaude Codeに読ませて開発を進めるための設計書。
> 「設計はAIモード込みで最初から、実装は動くものから順に」が方針。
> v2変更点: AIモードの会話エンジンを ElevenLabs Conversational AI (Agents) に変更。

---

## 1. プロジェクト概要

社内向けテレアポ支援ツール。Excelでまとめた電話番号リストを取り込み、2つのモードで架電する。

- **AIモード**: ElevenLabsのAIエージェントが実際に電話で会話する(ElevenLabs Agents + Twilioネイティブ統合)
- **手動モード**: 自分がブラウザから発信して話す(Twilio Voice JS SDK)。画面にトークスクリプトを表示

ログイン・権限管理は不要(社内利用のみ)。

## 2. 機能要件

### 2-1. リスト管理
- Excelファイル(.xlsx)をアップロードして架電リストとして取り込む
- 想定カラム: 会社名 / 担当者名 / 電話番号 / メモ(最初は列固定でOK)
- リスト一覧表示、ステータス表示(未架電 / 不在 / アポ獲得 / NG / 再架電)

### 2-2. 手動モード
- リストの行をクリック → ブラウザから発信(Twilio Voice JS SDK、マイク/ヘッドセット使用)
- 通話中、画面にトークスクリプトを表示(事前に登録・編集可能)
- 通話終了後、結果(ステータス + メモ)を記録

### 2-3. AIモード
- リストから対象を選んで「AI発信」→ サーバーがElevenLabsの発信APIを叩く
  - `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`
  - パラメータ: `agent_id` / `agent_phone_number_id` / `to_number`(+81形式)
  - `conversation_initiation_client_data` で会社名・担当者名などの動的変数を渡し、エージェントのプロンプト内で `{{company}}` のように使う
- 会話そのもの(音声認識・LLM・音声合成・割り込み制御)は**すべてElevenLabs側が処理**。自前実装なし
- AIの話す内容は ElevenLabsダッシュボードのエージェント設定(システムプロンプト・初回挨拶・声)で管理
- 通話終了後、ElevenLabsの**post-callウェブフック**がサーバーに通知 → 会話の文字起こしと分析結果を保存
- 結果判定はElevenLabsエージェントの評価機能(success criteria / data collection)を設定し、「アポ獲得したか」「再架電希望日時」などを構造化データとして受け取る

### 2-4. 結果管理
- 架電履歴一覧(日時 / モード / 結果 / メモ / AIモードなら会話ログ)
- ステータスごとの件数サマリー

## 3. 技術スタック

| 層 | 技術 | 選定理由 |
|---|---|---|
| フロントエンド | React + Vite | シンプル。Claude Codeとの相性も良い |
| バックエンド | Node.js + Express | REST APIとWebhook受信のみ。WebSocketサーバー不要に |
| DB | SQLite (better-sqlite3) | 社内ツール規模ならファイル1個で完結 |
| Excel取込 | SheetJS (xlsx) | .xlsx読み込みの定番 |
| 電話回線 | Twilio (番号 + Voice JS SDK) | 番号はElevenLabsにインポートして共用 |
| 音声AI | ElevenLabs Conversational AI (Agents) | STT/LLM/TTS/割り込みを丸ごと任せられる。Twilioネイティブ統合あり |
| 開発時の公開URL | ngrok | Webhook受信用 |

## 4. アーキテクチャ

[Excelリスト] → アップロード → [React 管理画面] ──REST──> [Node.js サーバー] ──> [SQLite]

サーバーから2分岐:
- 手動モード: [Twilio Voice JS SDK] でブラウザ⇔Twilio⇔顧客
- AIモード: [ElevenLabs 発信APIを1回叩く] → [ElevenLabs Agent ⇔ Twilio ⇔ 顧客] 会話は全部ElevenLabsが処理 → 通話終了後 [post-call Webhook → サーバー] で文字起こし・評価結果を保存

ポイント: AIモードで自分が書くコードは「発信APIを1回叩く」と「終了後のWebhookを受けて保存する」の2つだけ。会話中の処理は一切書かない。

## 5. データモデル(SQLite)

```sql
-- 架電先リスト
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT,
  person TEXT,
  phone TEXT NOT NULL,          -- E.164形式(+81...)に正規化して保存
  memo TEXT,
  status TEXT DEFAULT '未架電',  -- 未架電/不在/アポ獲得/NG/再架電
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 架電履歴
CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id),
  mode TEXT NOT NULL,              -- 'ai' or 'manual'
  result TEXT,                     -- 通話結果ステータス
  note TEXT,                       -- 手動メモ
  transcript TEXT,                 -- AIモードの会話ログ(JSON文字列)
  analysis TEXT,                   -- ElevenLabsの評価結果(JSON文字列)
  el_conversation_id TEXT,         -- ElevenLabsのconversation_id
  twilio_call_sid TEXT,
  started_at TEXT,
  ended_at TEXT
);

-- トークスクリプト(手動モード用)
CREATE TABLE scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  body TEXT,
  is_active INTEGER DEFAULT 0
);
-- AI用プロンプトはElevenLabsダッシュボード側で管理するためDBに持たない
```

## 6. 画面一覧

1. リスト画面(メイン): 架電リスト表 + Excelアップロード + 各行に「手動発信」「AI発信」ボタン
2. 通話画面(手動): 通話コントロール(切断/ミュート) + トークスクリプト表示 + 結果入力フォーム
3. AI通話モニター: AI発信のステータス表示、終了後に会話ログ・評価結果を表示して結果を確定
4. スクリプト設定: 手動用スクリプト編集(AI用はElevenLabsダッシュボードへのリンクを置く)
5. 履歴画面: 架電履歴一覧 + サマリー

## 7. API設計(概要)

```
POST    /api/contacts/import     # Excelアップロード→取込
GET     /api/contacts            # リスト取得(ステータス絞込可)
PATCH   /api/contacts/:id        # ステータス・メモ更新

POST    /api/calls/manual/token  # 手動モード: ブラウザ発信用アクセストークン発行
POST    /api/calls/ai            # AIモード: ElevenLabs発信APIを呼ぶ
GET     /api/calls               # 履歴取得
PATCH   /api/calls/:id           # 結果確定

GET/PUT /api/scripts             # 手動用スクリプト管理

POST    /webhooks/elevenlabs     # post-call Webhook受信(文字起こし・評価結果)
                                 #   ※HMAC署名検証を必ず実装する
POST    /twiml/voice             # 手動発信用TwiML
POST    /api/twilio/status       # 手動モードの通話終了検知
```

### AI発信処理のイメージ(server/ai/elevenlabs.js)

```js
// AIモードの発信: ElevenLabsのAPIを1回叩くだけ
async function startAiCall(contact) {
  const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: contact.phone,  // +81形式
      conversation_initiation_client_data: {
        dynamic_variables: {
          company: contact.company,   // プロンプト内で {{company}} として参照
          person: contact.person,
        },
      },
    }),
  });
  const data = await res.json();  // { success, conversation_id, callSid }
  return data;  // conversation_idをcallsテーブルに保存しWebhookと突合する
}
```

## 8. ElevenLabs側の設定(コードの外でやること)

1. ElevenLabsアカウント作成 → Agents でエージェント作成
   - システムプロンプト(テレアポの流れ、ヒアリング項目、NG時の引き際)
   - 初回挨拶(welcome message)、日本語の声を選択、言語: ja
   - LLMの選択
2. Twilioの電話番号をElevenLabsのPhone Numbersにインポート(Account SID + Auth Token)
   - インポート時にWebhookは自動設定される
   - 取得した phone_number_id を .env に控える
3. post-call webhook のURLを設定(開発中はngrokのURL + /webhooks/elevenlabs)
4. 評価設定: success criteria / data collection で「アポ獲得」「再架電希望」などを定義

## 9. 実装フェーズ

### Phase 0: 準備(コードを書く前)
- [ ] Twilioアカウント作成 + 日本の電話番号(050)取得 ※審査に数日かかることがあるので最初に申請
- [ ] ElevenLabsアカウント作成(Agentsが使えるプラン確認)
- [ ] ngrokインストール
- [ ] プロジェクト雛形作成(本設計書をClaude Codeに読ませてscaffold)

### Phase 1: リスト管理 + 手動モード
- [ ] SQLiteスキーマ + Express API
- [ ] Excel取込(電話番号を+81形式に正規化。Excelの先頭0落ち対策も)
- [ ] リスト画面
- [ ] Twilio Voice JS SDKでブラウザ発信(まず自分のスマホにかけてテスト)
- [ ] 通話画面 + 結果記録
- → この時点で社内利用開始できる

### Phase 2: AIモード
- [ ] ElevenLabsでエージェント作成・番号インポート(8章)
- [ ] まずElevenLabsダッシュボードの「Outbound call」ボタンから自分のスマホにテスト発信(コード不要で会話品質を先に確認できる)
- [ ] /api/calls/ai 実装(発信API呼び出し)
- [ ] /webhooks/elevenlabs 実装(署名検証 + transcript/analysis保存)
- [ ] AI通話モニター画面
- [ ] プロンプトのチューニング(自分のスマホ相手に最低数十回テスト)

### Phase 3: 運用改善
- [ ] 連続架電(リスト上から順に自動発信。ElevenLabsのBatch Calling機能の利用も検討)
- [ ] 通話録音(call_recording_enabled。※相手への告知を検討)
- [ ] 結果のExcelエクスポート
- [ ] 再架電予定日のリマインド表示

## 10. コスト目安(契約前に最新の料金ページで必ず確認)

- Twilio: 050番号 月数百円程度 + 日本向け通話料(1分十数円程度)
- ElevenLabs: Agentsは会話分数ベースの課金。通話料(Twilio)とAI会話料(ElevenLabs)が二重にかかる点に注意
- ざっくり: AIモード1通話(3〜5分)あたり百円前後を見込み、テスト運用で実測してから本格運用の予算を決める

## 11. 注意点・リスク

1. 法律: 消費者向け電話勧誘は特定商取引法の規制対象。法人向け(B2B)限定が安全。AIが話す場合は冒頭で自動音声であることを名乗る設計を推奨
2. 番号の共用問題: TwilioからElevenLabsに番号をインポートすると、その番号への着信はAIエージェントが取る設定になる。折り返しを人間が取りたい場合は番号を2つに分けることを検討
3. Webhookのセキュリティ: /webhooks/elevenlabs は署名検証(HMAC)を必ず実装
4. 会話品質: プロンプト・声・話速のチューニングが成果を左右する。ダッシュボードのテスト発信で品質を固めてからツールに組み込む
5. 架電ペース: 同一番号からの大量発信は着信拒否されやすい。1日の上限を設ける
6. 開発時: Webhook受信にngrokが必要。ngrok再起動のたびにElevenLabs側のWebhook URLを更新する

## 12. ディレクトリ構成(案)

```
ai-teleapo/
├── server/
│   ├── index.js                 # Expressエントリ
│   ├── db.js                    # SQLite初期化
│   ├── routes/                  # REST API
│   ├── webhooks/elevenlabs.js   # post-call受信 + 署名検証
│   ├── ai/elevenlabs.js         # 発信API呼び出し
│   └── twiml/                   # 手動モード用TwiML
├── client/                      # React (Vite)
│   └── src/pages/               # リスト/通話/モニター/設定/履歴
├── .env                         # TWILIO_*, ELEVENLABS_API_KEY,
│                                #   ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID
└── DESIGN.md                    # この設計書
```

---

## 13. デプロイ方針(まず1台運用 → 後で複数人化)

### 現状: 1台のPCで運用
- サーバー(Express)もクライアント(React)も同じPCのlocalhostで動かす
- 認証なしでOK(そのPCを触れる人 = 利用者)
- SQLiteファイルもそのPC上に1つ

### 将来: 複数人での利用に拡張する(再構築ではなく「設定＋認証の追加」で済ませる)
そのために Phase 1 から以下の「安い保険」を仕込んでおく:

1. **クライアントのAPI接続先をハードコードしない**
   - `http://localhost:3000` を直書きせず `client/.env` の `VITE_API_BASE_URL` から読む
   - → サーバーを共有PC/社内サーバーへ移すとき、設定1行変更で全員のブラウザがそこを向く

2. **DBアクセスを `db.js` の薄い層に閉じ込める**
   - SQLとロジックを混ぜず、データ操作を関数として集約
   - → 同時アクセスが増えてSQLiteが辛くなったら、この層だけ差し替えてPostgresへ移行できる
   - 補足: better-sqlite3 は **WALモード**を有効化しておく。社内数人規模ならSQLiteのままで十分

3. **認証ミドルウェアの「箱」だけ先に用意し、今は素通り設定にする**
   - 全API(`/api/*`)の手前に認証ミドルウェアを1枚挟む。現状は no-op(素通り)
   - 複数人化＝LANや社外公開のタイミングで「共有パスワード or 簡易トークン」をONにするだけ
   - **`/webhooks/elevenlabs` は認証の外**に置く(ElevenLabsが叩くため)。代わりにHMAC署名で守る

4. **Twilioの同時通話数は物理制約として認識**
   - 番号2つ = 同時2通話まで。複数人が同時架電するなら番号を足す(コードではなく契約の対応)

### 今はやらないこと(複数人化が現実になってからで十分)
- ユーザーテーブル / 権限管理 / ログイン画面
- 1〜4の保険さえ守れば後付けが容易

---

## 14. v2.1 補足(ElevenLabs公式docs検証で判明した実装上の重要点)

> 2026-06 時点の公式ドキュメントで検証。発信エンドポイント・必須パラメータ・
> レスポンス(success / conversation_id / callSid)は本設計書の記述どおりで正しい。
> 加えて以下を実装に反映する。

### 14-1. Webhookは3種類。`call_initiation_failure` も受ける
| type | いつ届くか | 用途 |
|---|---|---|
| `post_call_transcription` | 通話成立時。transcript + analysis 入り | メインの結果保存 |
| `post_call_audio` | 音声(base64)だけ欲しい時 | 当面は使わない |
| `call_initiation_failure` | 接続エラー / 相手が拒否 / 出なかった 時 | 「不在」「失敗」を自動でステータス反映 |

→ `/webhooks/elevenlabs` ハンドラは `type` を見て分岐する。

### 14-2. ⚠️ 留守電(自動応答)は「成功」扱いになる罠
- 留守番電話や自動音声が応答した場合、ElevenLabsは「発信成功」とみなし `call_initiation_failure` は飛ばない
- AIが留守電に喋り続けて**課金だけ発生**するケースがある
- → transcript / analysis の中身で留守電を見分ける後処理を入れる(プロンプト側で「留守電なら早期終了」も検討)

### 14-3. 署名検証は公式SDKを使う(自前HMACより堅い)
- 署名ヘッダ名は `elevenlabs-signature`
- `@elevenlabs/elevenlabs-js` の `webhooks.constructEvent(rawBody, sig, secret)` が
  署名検証＋タイムスタンプ検証＋JSONパースを一括で行う
- **ただし raw body が必須**。`/webhooks/elevenlabs` ルートだけ `express.raw()` を使い、
  他のAPIの `express.json()` と混ぜない

### 14-4. webhookペイロード構造(保存設計に直結)
```
{
  type,                          // "post_call_transcription" など
  event_timestamp,               // Unix秒
  data: {
    conversation_id,
    transcript: [ { role, message, ...timing } ],
    analysis: {
      evaluation_criteria_results,   // success criteria の判定
      data_collection_results,       // 「アポ獲得」「再架電希望日時」など構造化データ
      call_successful,
      transcript_summary
    },
    metadata: { call_duration, cost, ... },   // cost を保存すればコスト集計に使える
    agent_id, status
  }
}
```
- `data.transcript` → `calls.transcript`、`data.analysis` → `calls.analysis` にそのまま保存
- `data.metadata.cost` を保存しておくとコスト上限・キルスイッチ(11章)に使える

### 14-5. 便利な発信パラメータ
- `call_recording_enabled` (boolean) … Phase3の録音はこのパラメータ1個でON(※相手への告知を検討)
- `telephony_call_config` の呼び出しタイムアウト(デフォルト60秒) … 「何秒で不在判定するか」を制御

### 14-6. 実装で詰まりやすい所(レビューでの指摘事項)
- **電話番号正規化が想像以上に厄介**: 先頭0落ち / 科学記法 / 全角数字 / ハイフン・括弧・内線混在。
  `libphonenumber-js` を使い、取込時にプレビュー確認画面を設ける
- **手動モードもngrok等の公開URLが必要**: Twilioが `/twiml/voice` を叩くため。
  さらにブラウザのマイクは **HTTPS必須**(localhostは例外)
- **better-sqlite3 はWindowsでビルドにコケることがある**: Visual Studio Build Tools が必要な場合あり。
  転んだら Node標準の `node:sqlite` への切り替えも検討
- **再架電希望日時の保存先**: `analysis` のJSON内だけでなく、リマインド表示(Phase3)用に
  `contacts` か `calls` に `next_call_at` 列を足すか検討
