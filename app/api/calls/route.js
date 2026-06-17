import { callsRepo, contactsRepo, VALID_STATUSES } from '@/lib/db';

// GET /api/calls — 架電履歴一覧
export async function GET() {
  return Response.json(await callsRepo.list());
}

// POST /api/calls — 架電結果を記録(手動スマホ発信／ブラウザ発信)
export async function POST(request) {
  const body = await request.json();
  const { contact_id, mode = 'manual', result, note, started_at, ended_at } = body;
  if (!contact_id) return Response.json({ error: 'contact_id は必須' }, { status: 400 });
  if (result && !VALID_STATUSES.includes(result)) {
    return Response.json({ error: `result は ${VALID_STATUSES.join('/')} のいずれか` }, { status: 400 });
  }

  const call = await callsRepo.insert({ contact_id, mode, result, note, started_at });
  if (ended_at) await callsRepo.update(call.id, { ended_at });
  if (result) await contactsRepo.update(contact_id, { status: result });
  return Response.json(await callsRepo.get(call.id), { status: 201 });
}
