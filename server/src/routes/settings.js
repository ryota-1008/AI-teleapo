import { Router } from 'express';
import { settingsRepo, callsRepo } from '../db.js';

const router = Router();

export function todayPrefix() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// 発信前の安全チェック (DESIGN 11-5)。/api/calls/ai と /manual/token で共用。
export function outboundGuard() {
  if (settingsRepo.get('calls_paused', 'false') === 'true') {
    return { ok: false, status: 423, error: 'calls_paused', note: '架電が一時停止中です（設定で解除できます）' };
  }
  const cap = Number(settingsRepo.get('daily_call_cap', '0'));
  if (cap > 0) {
    const used = callsRepo.countToday(todayPrefix());
    if (used >= cap) {
      return { ok: false, status: 429, error: 'daily_cap_reached', note: `本日の架電上限(${cap}件)に達しました` };
    }
  }
  return { ok: true };
}

// GET /api/settings — 現在の設定 + 当日件数
router.get('/', (req, res) => {
  res.json({
    calls_paused: settingsRepo.get('calls_paused', 'false') === 'true',
    daily_call_cap: Number(settingsRepo.get('daily_call_cap', '0')),
    today_count: callsRepo.countToday(todayPrefix()),
  });
});

// PUT /api/settings — 設定更新
router.put('/', (req, res) => {
  if ('calls_paused' in req.body) settingsRepo.set('calls_paused', req.body.calls_paused ? 'true' : 'false');
  if ('daily_call_cap' in req.body) {
    const cap = Math.max(0, Math.floor(Number(req.body.daily_call_cap) || 0));
    settingsRepo.set('daily_call_cap', cap);
  }
  res.json({
    calls_paused: settingsRepo.get('calls_paused', 'false') === 'true',
    daily_call_cap: Number(settingsRepo.get('daily_call_cap', '0')),
    today_count: callsRepo.countToday(todayPrefix()),
  });
});

export default router;
