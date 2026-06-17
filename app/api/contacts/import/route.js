import * as XLSX from 'xlsx';
import { contactsRepo } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

// ヘッダ名のゆらぎを吸収するためのエイリアス（法人リスト形式にも対応）
const COLUMN_ALIASES = {
  company: ['会社名', '会社', '企業名', '法人名称', '法人名', '法人', '団体名', '組織名', '名称', 'company'],
  person: ['担当者名', '担当者', '担当', '氏名', '名前', '代表者名', '代表者', '代表', 'person', 'name'],
  phone: ['電話番号', '電話', 'tel', 'phone', 'phone_number'],
  memo: ['メモ', '備考', '法人サマリー', 'サマリー', '概要', 'note', 'memo'],
};

function detectKey(header) {
  const h = String(header ?? '').trim().toLowerCase();
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === h)) return key;
  }
  return null;
}

function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
  return { headers, rows: rows.slice(1) };
}

function suggestMapping(headers) {
  const mapping = { company: null, person: null, phone: null, memo: null };
  headers.forEach((h, idx) => {
    const key = detectKey(h);
    if (key && mapping[key] === null) mapping[key] = idx;
  });
  if (Object.values(mapping).every((v) => v === null)) {
    if (headers.length > 0) mapping.company = 0;
    if (headers.length > 1) mapping.person = 1;
    if (headers.length > 2) mapping.phone = 2;
    if (headers.length > 3) mapping.memo = 3;
  }
  return mapping;
}

function applyMapping(rows, mapping) {
  const at = (row, idx) => (idx === null || idx === undefined ? null : row[idx] ?? null);
  return rows.map((r) => ({
    company: at(r, mapping.company),
    person: at(r, mapping.person),
    phone: at(r, mapping.phone),
    memo: at(r, mapping.memo),
  }));
}

// POST /api/contacts/import?commit=true|false
export async function POST(request) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'file がありません' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseSheet(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return Response.json({ error: 'Excelの解析に失敗しました', detail: String(e.message) }, { status: 400 });
  }
  const { headers, rows } = parsed;
  if (headers.length === 0) return Response.json({ error: 'ヘッダー行が見つかりません' }, { status: 400 });

  let mapping;
  const mappingRaw = form.get('mapping');
  if (mappingRaw) {
    try { mapping = JSON.parse(mappingRaw); }
    catch { return Response.json({ error: 'mappingのJSONが不正です' }, { status: 400 }); }
  } else {
    mapping = suggestMapping(headers);
  }

  const records = applyMapping(rows, mapping);
  const valid = [];
  const invalid = [];
  let noPhone = 0;
  for (const row of records) {
    if (!row.phone && !row.company && !row.person) continue;
    const phoneRaw = String(row.phone ?? '').trim();
    if (!phoneRaw) { noPhone++; continue; }
    const n = normalizePhone(phoneRaw);
    if (n.ok) valid.push({ company: row.company || null, person: row.person || null, phone: n.e164, memo: row.memo || null });
    else invalid.push({ company: row.company || null, person: row.person || null, rawPhone: n.raw, reason: n.reason });
  }

  const existing = new Set(await contactsRepo.existingPhones());
  const seen = new Set();
  const fresh = [];
  const duplicates = [];
  for (const v of valid) {
    if (existing.has(v.phone) || seen.has(v.phone)) duplicates.push(v);
    else { seen.add(v.phone); fresh.push(v); }
  }

  const commit = new URL(request.url).searchParams.get('commit') === 'true';
  if (!commit) {
    return Response.json({
      preview: true,
      headers,
      sampleData: rows.slice(0, 5).map((r) => headers.map((_, i) => String(r[i] ?? ''))),
      mapping,
      phoneMissing: mapping.phone === null || mapping.phone === undefined,
      validCount: fresh.length,
      duplicateCount: duplicates.length,
      noPhoneCount: noPhone,
      invalidCount: invalid.length,
      invalid: invalid.slice(0, 50),
    });
  }

  if (mapping.phone === null || mapping.phone === undefined) {
    return Response.json({ error: '電話番号の列が指定されていません' }, { status: 400 });
  }
  const inserted = await contactsRepo.insertMany(fresh);
  return Response.json({ preview: false, inserted, duplicateSkipped: duplicates.length, noPhoneSkipped: noPhone, invalidSkipped: invalid.length });
}
