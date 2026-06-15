import { Router } from 'express';
import { callsRepo, contactsRepo, VALID_STATUSES } from '../db.js';
import { isTwilioConfigured, createVoiceToken } from '../lib/twilio.js';
import { isElevenLabsConfigured, startAiCall } from '../lib/elevenlabs.js';
import { toXlsxBuffer, sendXlsx } from '../lib/xlsxExport.js';

const router = Router();

// GET /api/calls — 架電履歴一覧
router.get('/', (req, res) => {
  res.json(callsRepo.list());
});

// GET /api/calls/export — 架電履歴をExcel出力 (/:id より前に置く)
router.get('/export', (req, res) => {
  const rows = callsRepo.list().map((c) => {
    let summary = '';
    try { summary = c.analysis ? (JSON.parse(c.analysis).transcript_summary || '') : ''; } catch { /* noop */ }
    return {
      日時: c.started_at || '',
      会社名: c.company || '',
      担当者: c.person || '',
      電話番号: c.phone || '',
      モード: c.mode === 'ai' ? 'AI' : '手動',
      結果: c.result || '',
      メモ: c.note || '',
      AI要約: summary,
      終了日時: c.ended_at || '',
    };
  });
  const date = new Date().toISOString().slice(0, 10);
  sendXlsx(res, toXlsxBuffer(rows, '架電履歴'), `calls_${date}.xlsx`);
});

// GET /api/calls/:id — 1件取得(AIモニターのポーリング用)
router.get('/:id', (req, res) => {
  const call = callsRepo.get(Number(req.params.id));
  if (!call) return res.status(404).json({ error: 'not found' });
  res.json(call);
});

// POST /api/calls — 架電レコード作成(結果記録)。
// 手動でスマホ発信した結果の記録にも、ブラウザ発信開始時の記録にも使う。
router.post('/', (req, res) => {
  const { contact_id, mode = 'manual', result, note, started_at, ended_at } = req.body;
  if (!contact_id) return res.status(400).json({ error: 'contact_id は必須' });
  if (result && !VALID_STATUSES.includes(result)) {
    return res.status(400).json({ error: `result は ${VALID_STATUSES.join('/')} のいずれか` });
  }

  const call = callsRepo.insert({ contact_id, mode, result, note, started_at });
  if (ended_at) callsRepo.update(call.id, { ended_at });
  if (result) contactsRepo.update(contact_id, { status: result }); // contactのステータスも揃える
  res.status(201).json(callsRepo.get(call.id));
});

// PATCH /api/calls/:id — 結果確定(result/note等)。result があれば contact のステータスも揃える
router.patch('/:id', (req, res) => {
  const call = callsRepo.get(Number(req.params.id));
  if (!call) return res.status(404).json({ error: 'not found' });

  if (req.body.result && !VALID_STATUSES.includes(req.body.result)) {
    return res.status(400).json({ error: `result は ${VALID_STATUSES.join('/')} のいずれか` });
  }

  const updated = callsRepo.update(call.id, req.body);
  if (req.body.result && call.contact_id) {
    contactsRepo.update(call.contact_id, { status: req.body.result });
  }
  res.json(updated);
});

// --- 以下は Phase 1(手動) / Phase 2(AI) で実装予定のスタブ ---

// POST /api/calls/manual/token — Twilio Voice JS SDK 用アクセストークン発行(Phase 1)
router.post('/manual/token', (req, res) => {
  if (!isTwilioConfigured()) {
    // 鍵未設定: フロントはこれを見て「スマホ発信＋結果記録のみ」モードに切り替える
    return res.status(503).json({ error: 'twilio_not_configured', note: 'Twilioの鍵が未設定です' });
  }
  try {
    const token = createVoiceToken('agent'); // 1台運用なので固定identity。複数人化時に分ける
    res.json({ token, identity: 'agent' });
  } catch (e) {
    res.status(500).json({ error: 'token_failed', detail: String(e.message) });
  }
});

// POST /api/calls/ai — ElevenLabs 発信API呼び出し(Phase 2)
router.post('/ai', async (req, res) => {
  const { contact_id } = req.body;
  if (!contact_id) return res.status(400).json({ error: 'contact_id は必須' });

  const contact = contactsRepo.get(Number(contact_id));
  if (!contact) return res.status(404).json({ error: 'contact not found' });

  if (!isElevenLabsConfigured()) {
    return res.status(503).json({ error: 'elevenlabs_not_configured', note: 'ElevenLabsの鍵が未設定です' });
  }

  try {
    const data = await startAiCall(contact);
    // conversation_id を控えて、後から来るwebhookと突合する (DESIGN 4)
    const call = callsRepo.insert({
      contact_id: contact.id,
      mode: 'ai',
      el_conversation_id: data.conversation_id || null,
      twilio_call_sid: data.callSid || null,
      started_at: new Date().toISOString(),
    });
    res.status(201).json({ call, elevenlabs: data });
  } catch (e) {
    res.status(e.status || 502).json({ error: 'ai_call_failed', detail: String(e.message) });
  }
});

export default router;
