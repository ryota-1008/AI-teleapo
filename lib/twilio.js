// Twilio 手動モードのヘルパー。鍵が未設定でも起動できるよう設定チェックを噛ませる。
import twilio from 'twilio';

const REQUIRED_FOR_TOKEN = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID'];

export function isTwilioConfigured() {
  return REQUIRED_FOR_TOKEN.every((k) => !!process.env[k]);
}

export function createVoiceToken(identity) {
  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity, ttl: 3600 }
  );
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID, incomingAllow: false }));
  return token.toJwt();
}

export function buildDialTwiml(toNumber) {
  const { VoiceResponse } = twilio.twiml;
  const response = new VoiceResponse();
  if (!toNumber) {
    response.say({ language: 'ja-JP' }, '発信先が指定されていません。');
    return response.toString();
  }
  const dial = response.dial({ callerId: process.env.TWILIO_CALLER_ID || undefined, answerOnBridge: true });
  dial.number(toNumber);
  return response.toString();
}
