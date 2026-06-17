import { scriptsRepo } from '@/lib/db';

// GET /api/scripts — 手動用トークスクリプト一覧
export async function GET() {
  return Response.json(await scriptsRepo.list());
}

// PUT /api/scripts — 作成 or 更新(id があれば更新)
export async function PUT(request) {
  const { id, title, body, is_active } = await request.json();
  return Response.json(await scriptsRepo.upsert({ id, title, body, is_active }));
}
