import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { auth } from './middleware/auth.js';
import contactsRouter from './routes/contacts.js';
import callsRouter from './routes/calls.js';
import scriptsRouter from './routes/scripts.js';
import twilioRouter from './routes/twilio.js';

const app = express();
app.use(cors());

// --- Webhook は JSON パーサより前・認証の外に置く (DESIGN 13-3, 14-3) ---
// HMAC署名検証に raw body が必要なので express.raw() を使う。
app.post('/webhooks/elevenlabs', express.raw({ type: '*/*' }), (req, res) => {
  // Phase 2 で実装: @elevenlabs/elevenlabs-js の webhooks.constructEvent(
  //   req.body, req.get('elevenlabs-signature'), process.env.ELEVENLABS_WEBHOOK_SECRET)
  // で検証し、type(post_call_transcription / call_initiation_failure)で分岐して保存する。
  console.log('[webhook] received (Phase 2 で処理を実装)');
  res.status(200).json({ received: true });
});

// --- Twilio が叩くルート(TwiML / status)も認証の外。専用パーサを内部で使う ---
app.use('/', twilioRouter);

// --- ここから先は JSON ボディ + 認証ミドルウェア ---
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', auth);
app.use('/api/contacts', contactsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/scripts', scriptsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AIテレアポ server listening on http://localhost:${PORT}`);
  if (process.env.AUTH_ENABLED === 'true') console.log('  認証: 有効 (x-app-password 必須)');
});
