// 取込のマッピング＆判定ロジック（クライアント・サーバー共用、純粋関数）。
// 大きいExcelはブラウザで解析→ここで判定→分割送信する（Vercelの4.5MB制限回避）。
import { normalizePhone } from './phone.js';

export const COLUMN_ALIASES = {
  company: ['会社名', '会社', '企業名', '法人名称', '法人名', '法人', '団体名', '組織名', '名称', 'company'],
  person: ['担当者名', '担当者', '担当', '氏名', '名前', '代表者名', '代表者', '代表', 'person', 'name'],
  phone: ['電話番号', '電話', 'tel', 'phone', 'phone_number'],
  industry: ['業種', '業種(中分類1)', '業種(中分類)', '業界', 'industry'],
  memo: ['メモ', '備考', '法人サマリー', 'サマリー', '概要', 'note', 'memo'],
};

export function detectKey(header) {
  const h = String(header ?? '').trim().toLowerCase();
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === h)) return key;
  }
  return null;
}

export function suggestMapping(headers) {
  const mapping = { company: null, person: null, phone: null, industry: null, memo: null };
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

// 行配列とマッピングから、取込判定をまとめて行う。
// 戻り値の fresh が実際に送る正規化済みレコード。
export function analyzeRows(rows, mapping) {
  const at = (row, idx) => (idx === null || idx === undefined ? null : row[idx] ?? null);
  const seen = new Set();
  const fresh = [];
  const invalid = [];
  let noPhoneCount = 0;
  let withinDupCount = 0;

  for (const r of rows) {
    const rec = {
      company: at(r, mapping.company),
      person: at(r, mapping.person),
      phone: at(r, mapping.phone),
      industry: at(r, mapping.industry),
      memo: at(r, mapping.memo),
    };
    if (!rec.phone && !rec.company && !rec.person) continue; // 完全な空行
    const phoneRaw = String(rec.phone ?? '').trim();
    if (!phoneRaw) { noPhoneCount++; continue; }
    const n = normalizePhone(phoneRaw);
    if (!n.ok) {
      if (invalid.length < 50) invalid.push({ company: rec.company || null, person: rec.person || null, rawPhone: n.raw, reason: n.reason });
      else invalid.push(null); // カウント用
      continue;
    }
    if (seen.has(n.e164)) { withinDupCount++; continue; } // ファイル内重複
    seen.add(n.e164);
    fresh.push({ company: rec.company || null, person: rec.person || null, phone: n.e164, industry: rec.industry || null, memo: rec.memo || null });
  }

  return {
    validCount: fresh.length,
    noPhoneCount,
    withinDupCount,
    invalidCount: invalid.length,
    invalidSample: invalid.filter(Boolean),
    fresh,
  };
}
