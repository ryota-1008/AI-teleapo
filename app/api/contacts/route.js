import { contactsRepo } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

// GET /api/contacts?status=未架電
export async function GET(request) {
  const status = new URL(request.url).searchParams.get('status') || undefined;
  return Response.json(await contactsRepo.list({ status }));
}

// POST /api/contacts — 1件手動追加(電話番号を正規化)
export async function POST(request) {
  const body = await request.json();
  const n = normalizePhone(body.phone);
  if (!n.ok) return Response.json({ error: `電話番号が不正です: ${n.reason}` }, { status: 400 });
  const existing = await contactsRepo.existingPhones();
  if (existing.includes(n.e164)) {
    return Response.json({ error: 'この電話番号は既に登録されています' }, { status: 409 });
  }
  const c = await contactsRepo.create({ company: body.company, person: body.person, phone: n.e164, memo: body.memo });
  return Response.json(c, { status: 201 });
}
