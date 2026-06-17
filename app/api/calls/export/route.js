import { callsRepo } from '@/lib/db';
import { toXlsxBuffer } from '@/lib/xlsxExport';

// GET /api/calls/export — 架電履歴をExcel出力
export async function GET() {
  const list = await callsRepo.list();
  const rows = list.map((c) => {
    let summary = '';
    try { summary = c.analysis ? JSON.parse(c.analysis).transcript_summary || '' : ''; } catch { /* noop */ }
    return {
      日時: c.started_at ? new Date(c.started_at).toISOString() : '',
      会社名: c.company || '',
      担当者: c.person || '',
      電話番号: c.phone || '',
      モード: c.mode === 'ai' ? 'AI' : '手動',
      結果: c.result || '',
      メモ: c.note || '',
      AI要約: summary,
      終了日時: c.ended_at ? new Date(c.ended_at).toISOString() : '',
    };
  });
  const date = new Date().toISOString().slice(0, 10);
  const buffer = toXlsxBuffer(rows, '架電履歴');
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="calls_${date}.xlsx"`,
    },
  });
}
