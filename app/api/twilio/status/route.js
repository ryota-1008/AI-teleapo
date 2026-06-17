// POST /api/twilio/status — 通話のステータスコールバック(完了検知など)
export async function POST(request) {
  const form = await request.formData();
  console.log('[twilio status]', form.get('CallSid'), form.get('CallStatus'));
  return new Response(null, { status: 204 });
}
