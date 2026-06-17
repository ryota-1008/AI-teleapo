// 発信前の安全チェック（キルスイッチ・1日の架電上限）。/api/calls/ai と /manual/token で共用。
import { settingsRepo, callsRepo } from './db.js';

export async function outboundGuard() {
  if ((await settingsRepo.get('calls_paused', 'false')) === 'true') {
    return { ok: false, status: 423, error: 'calls_paused', note: '架電が一時停止中です（設定で解除できます）' };
  }
  const cap = Number(await settingsRepo.get('daily_call_cap', '0'));
  if (cap > 0) {
    const used = await callsRepo.countToday();
    if (used >= cap) {
      return { ok: false, status: 429, error: 'daily_cap_reached', note: `本日の架電上限(${cap}件)に達しました` };
    }
  }
  return { ok: true };
}
