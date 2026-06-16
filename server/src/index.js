import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { auth } from './middleware/auth.js';
import contactsRouter from './routes/contacts.js';
import callsRouter from './routes/calls.js';
import scriptsRouter from './routes/scripts.js';
import settingsRouter from './routes/settings.js';
import twilioRouter from './routes/twilio.js';
import { verifyWebhook } from './lib/elevenlabs.js';
import { callsRepo, contactsRepo } from './db.js';

const app = express();
app.use(cors());

// --- Webhook は JSON パーサより前・認証の外に置く (DESIGN 13-3, 14-3) ---
// HMAC署名検証に raw body が必要なので express.raw() を使う。
app.post('/webhooks/elevenlabs', express.raw({ type: '*/*' }), async (req, res) => {
  let event;
  try {
    if (process.env.ELEVENLABS_WEBHOOK_SECRET) {
      // 署名検証(HMAC + タイムスタンプ)。失敗すれば例外 (DESIGN 14-3)
      event = await verifyWebhook(req.body, req.get('elevenlabs-signature'));
    } else {
      // 開発時に秘密鍵未設定なら検証スキップ(本番では必ず設定すること)
      console.warn('[webhook] ELEVENLABS_WEBHOOK_SECRET 未設定: 署名検証をスキップ');
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    console.error('[webhook] 署名検証に失敗:', e.message);
    return res.status(401).json({ error: 'invalid_signature' });
  }

  try {
    handleElevenLabsEvent(event);
  } catch (e) {
    console.error('[webhook] 処理エラー:', e.message);
  }
  // 受領は速やかに200を返す (DESIGN 14)
  res.status(200).json({ received: true });
});

// webhookイベントを種別ごとに処理して calls/contacts に反映する (DESIGN 14-1)
function handleElevenLabsEvent(event) {
  const type = event?.type;
  const data = event?.data || {};
  const conversationId = data.conversation_id;
  const call = conversationId ? callsRepo.getByConversationId(conversationId) : null;

  if (type === 'post_call_transcription') {
    if (!call) { console.warn('[webhook] 該当通話なし conversation_id=', conversationId); return; }
    callsRepo.update(call.id, {
      transcript: data.transcript ? JSON.stringify(data.transcript) : null,
      analysis: data.analysis ? JSON.stringify(data.analysis) : null,
      ended_at: new Date().toISOString(),
    });
    // 結果(アポ獲得/NG等)の確定は人がモニター画面で行う (DESIGN 画面3)
    console.log('[webhook] post_call_transcription 保存 call_id=', call.id);
  } else if (type === 'call_initiation_failure') {
    // 接続失敗・相手が出ない等 → 「不在」として自動反映 (DESIGN 14-1)
    if (call) {
      callsRepo.update(call.id, { result: '不在', ended_at: new Date().toISOString() });
      if (call.contact_id) contactsRepo.update(call.contact_id, { status: '不在' });
      console.log('[webhook] call_initiation_failure → 不在 call_id=', call.id);
    } else {
      console.warn('[webhook] failure: 該当通話なし conversation_id=', conversationId);
    }
  } else {
    console.log('[webhook] 未処理タイプ:', type);
  }
}

// --- Twilio が叩くルート(TwiML / status)も認証の外。専用パーサを内部で使う ---
app.use('/', twilioRouter);

// --- ここから先は JSON ボディ + 認証ミドルウェア ---
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', auth);
app.use('/api/contacts', contactsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/scripts', scriptsRouter);
app.use('/api/settings', settingsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AIテレアポ server listening on http://localhost:${PORT}`);
  if (process.env.AUTH_ENABLED === 'true') console.log('  認証: 有効 (x-app-password 必須)');
});
