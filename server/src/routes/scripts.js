import { Router } from 'express';
import { scriptsRepo } from '../db.js';

const router = Router();

// GET /api/scripts — 手動用トークスクリプト一覧
router.get('/', (req, res) => {
  res.json(scriptsRepo.list());
});

// PUT /api/scripts — 作成 or 更新(id があれば更新)
router.put('/', (req, res) => {
  const { id, title, body, is_active } = req.body;
  res.json(scriptsRepo.upsert({ id, title, body, is_active }));
});

export default router;
