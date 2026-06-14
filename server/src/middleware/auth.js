// 認証ミドルウェアの「箱」 (DESIGN 13-3)。
// 今は AUTH_ENABLED=false なので素通り。複数人化のとき on にするだけで効く。
// 注意: webhook ルートはこのミドルウェアの外に置くこと(ElevenLabsが叩くため)。
export function auth(req, res, next) {
  if (process.env.AUTH_ENABLED !== 'true') return next();

  const password = process.env.APP_PASSWORD;
  const provided = req.get('x-app-password');
  if (password && provided === password) return next();

  return res.status(401).json({ error: 'unauthorized' });
}
