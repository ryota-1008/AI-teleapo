import { Router } from 'express';
import { callsRepo, contactsRepo, VALID_STATUSES } from '../db.js';

const router = Router();

// GET /api/calls — 架電履歴一覧
router.get('/', (req, res) => {
  res.json(callsRepo.list());
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
  res.status(501).json({ error: 'not implemented', note: 'Twilioアカウント取得後に実装 (DESIGN Phase 1)' });
});

// POST /api/calls/ai — ElevenLabs 発信API呼び出し(Phase 2)
router.post('/ai', (req, res) => {
  res.status(501).json({ error: 'not implemented', note: 'ElevenLabs設定後に実装 (DESIGN Phase 2)' });
});

export default router;
