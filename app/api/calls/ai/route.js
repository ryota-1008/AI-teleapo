import { callsRepo, contactsRepo, industryPitchesRepo } from '@/lib/db';
import { isElevenLabsConfigured, startAiCall } from '@/lib/elevenlabs';
import { outboundGuard } from '@/lib/guard';

// POST /api/calls/ai — ElevenLabs 発信API呼び出し
export async function POST(request) {
  const { contact_id } = await request.json();
  if (!contact_id) return Response.json({ error: 'contact_id は必須' }, { status: 400 });

  const contact = await contactsRepo.get(Number(contact_id));
  if (!contact) return Response.json({ error: 'contact not found' }, { status: 404 });

  const guard = await outboundGuard();
  if (!guard.ok) return Response.json({ error: guard.error, note: guard.note }, { status: guard.status });

  if (!isElevenLabsConfigured()) {
    return Response.json({ error: 'elevenlabs_not_configured', note: 'ElevenLabsの鍵が未設定です' }, { status: 503 });
  }

  try {
    // 業種に合わせたトークを解決して動的変数で渡す
    const matched = await industryPitchesRepo.match(contact.industry);
    const data = await startAiCall(contact, {
      industry: contact.industry || '',
      industry_pitch: matched?.pitch || '',
    });
    const call = await callsRepo.insert({
      contact_id: contact.id,
      mode: 'ai',
      el_conversation_id: data.conversation_id || null,
      twilio_call_sid: data.callSid || null,
      started_at: new Date().toISOString(),
    });
    return Response.json({ call, elevenlabs: data }, { status: 201 });
  } catch (e) {
    return Response.json({ error: 'ai_call_failed', detail: String(e.message) }, { status: e.status || 502 });
  }
}
