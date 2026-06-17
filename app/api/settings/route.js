import { settingsRepo, callsRepo } from '@/lib/db';

async function snapshot() {
  return {
    calls_paused: (await settingsRepo.get('calls_paused', 'false')) === 'true',
    daily_call_cap: Number(await settingsRepo.get('daily_call_cap', '0')),
    today_count: await callsRepo.countToday(),
  };
}

// GET /api/settings — 現在の設定 + 当日件数
export async function GET() {
  return Response.json(await snapshot());
}

// PUT /api/settings — 設定更新
export async function PUT(request) {
  const body = await request.json();
  if ('calls_paused' in body) await settingsRepo.set('calls_paused', body.calls_paused ? 'true' : 'false');
  if ('daily_call_cap' in body) {
    const cap = Math.max(0, Math.floor(Number(body.daily_call_cap) || 0));
    await settingsRepo.set('daily_call_cap', cap);
  }
  return Response.json(await snapshot());
}
