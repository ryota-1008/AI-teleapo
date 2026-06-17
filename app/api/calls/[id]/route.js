import { callsRepo, contactsRepo, VALID_STATUSES } from '@/lib/db';

// GET /api/calls/:id — 1件取得(AIモニターのポーリング用)
export async function GET(request, { params }) {
  const { id } = await params;
  const call = await callsRepo.get(Number(id));
  if (!call) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(call);
}

// PATCH /api/calls/:id — 結果確定。result があれば contact のステータスも揃える
export async function PATCH(request, { params }) {
  const { id } = await params;
  const call = await callsRepo.get(Number(id));
  if (!call) return Response.json({ error: 'not found' }, { status: 404 });

  const body = await request.json();
  if (body.result && !VALID_STATUSES.includes(body.result)) {
    return Response.json({ error: `result は ${VALID_STATUSES.join('/')} のいずれか` }, { status: 400 });
  }
  const updated = await callsRepo.update(call.id, body);
  if (body.result && call.contact_id) {
    await contactsRepo.update(call.contact_id, { status: body.result });
  }
  return Response.json(updated);
}
