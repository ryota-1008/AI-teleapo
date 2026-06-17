import { contactsRepo, VALID_STATUSES } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

// PATCH /api/contacts/:id — ステータス・メモ等の更新
export async function PATCH(request, { params }) {
  const { id } = await params;
  const contact = await contactsRepo.get(Number(id));
  if (!contact) return Response.json({ error: 'not found' }, { status: 404 });

  const body = await request.json();
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return Response.json({ error: `status は ${VALID_STATUSES.join('/')} のいずれか` }, { status: 400 });
  }

  const fields = { ...body };
  if (fields.phone !== undefined) {
    const n = normalizePhone(fields.phone);
    if (!n.ok) return Response.json({ error: `電話番号が不正です: ${n.reason}` }, { status: 400 });
    fields.phone = n.e164;
  }
  return Response.json(await contactsRepo.update(contact.id, fields));
}

// DELETE /api/contacts/:id — 架電履歴がある場合は拒否
export async function DELETE(request, { params }) {
  const { id } = await params;
  const contact = await contactsRepo.get(Number(id));
  if (!contact) return Response.json({ error: 'not found' }, { status: 404 });
  if ((await contactsRepo.callCount(contact.id)) > 0) {
    return Response.json({ error: '架電履歴があるため削除できません（履歴を残すため）' }, { status: 409 });
  }
  await contactsRepo.remove(contact.id);
  return new Response(null, { status: 204 });
}
