import { contactsRepo } from '@/lib/db';
import { toXlsxBuffer } from '@/lib/xlsxExport';

// GET /api/contacts/export — 連絡先一覧をExcel出力
export async function GET(request) {
  const status = new URL(request.url).searchParams.get('status') || undefined;
  const list = await contactsRepo.list({ status });
  const rows = list.map((c) => ({
    会社名: c.company || '',
    担当者: c.person || '',
    電話番号: c.phone || '',
    ステータス: c.status || '',
    再架電予定: c.next_call_at ? new Date(c.next_call_at).toISOString() : '',
    メモ: c.memo || '',
    登録日時: c.created_at ? new Date(c.created_at).toISOString() : '',
  }));
  const date = new Date().toISOString().slice(0, 10);
  const buffer = toXlsxBuffer(rows, '連絡先');
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="contacts_${date}.xlsx"`,
    },
  });
}
