import { isTwilioConfigured, createVoiceToken } from '@/lib/twilio';
import { outboundGuard } from '@/lib/guard';

// POST /api/calls/manual/token — Twilio Voice JS SDK 用アクセストークン発行
export async function POST() {
  const guard = await outboundGuard();
  if (!guard.ok) return Response.json({ error: guard.error, note: guard.note }, { status: guard.status });

  if (!isTwilioConfigured()) {
    return Response.json({ error: 'twilio_not_configured', note: 'Twilioの鍵が未設定です' }, { status: 503 });
  }
  try {
    return Response.json({ token: createVoiceToken('agent'), identity: 'agent' });
  } catch (e) {
    return Response.json({ error: 'token_failed', detail: String(e.message) }, { status: 500 });
  }
}
