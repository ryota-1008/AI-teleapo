import { Router } from 'express';
import { callsRepo, contactsRepo, VALID_STATUSES } from '../db.js';
import { isTwilioConfigured, createVoiceToken } from '../lib/twilio.js';

const router = Router();

// GET /api/calls — 架電履歴一覧
router.get('/', (req, res) => {
  res.json(callsRepo.list());
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
router.post('/ai', (req, res) => {
  res.status(501).json({ error: 'not implemented', note: 'ElevenLabs設定後に実装 (DESIGN Phase 2)' });
});

export default router;
