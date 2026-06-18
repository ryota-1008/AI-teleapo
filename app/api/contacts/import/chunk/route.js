import { contactsRepo } from '@/lib/db';

// POST /api/contacts/import/chunk — クライアントで正規化済みのレコードを一括投入する
// records: [{ company, person, phone(E.164), industry, memo }]
// DB既存の電話番号と重複するものはスキップ。前のチャンクの挿入も existingPhones に含まれるので
// チャンクをまたいだ重複も自然に弾ける（クライアントは逐次送信する）。
export async function POST(request) {
  const { records } = await request.json();
  if (!Array.isArray(records)) {
    return Response.json({ error: 'records(配列)が必要です' }, { status: 400 });
  }

  const existing = new Set(await contactsRepo.existingPhones());
  const fresh = [];
  let dupSkipped = 0;
  for (const r of records) {
    if (!r?.phone) continue;
    if (existing.has(r.phone)) { dupSkipped++; continue; }
    existing.add(r.phone);
    fresh.push(r);
  }

  const inserted = fresh.length ? await contactsRepo.insertMany(fresh) : 0;
  return Response.json({ inserted, dupSkipped });
}
