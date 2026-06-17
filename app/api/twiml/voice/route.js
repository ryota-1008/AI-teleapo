import { buildDialTwiml } from '@/lib/twilio';

// POST /api/twiml/voice — ブラウザ発信時に Twilio が取得しにくる発信指示(TwiML)
export async function POST(request) {
  const form = await request.formData();
  const to = form.get('To');
  return new Response(buildDialTwiml(to), { headers: { 'Content-Type': 'text/xml' } });
}
