import { industryPitchesRepo } from '@/lib/db';

// GET /api/industry-pitches — 業種別トーク一覧
export async function GET() {
  return Response.json(await industryPitchesRepo.list());
}

// POST /api/industry-pitches — 新規作成
export async function POST(request) {
  const body = await request.json();
  return Response.json(await industryPitchesRepo.create(body), { status: 201 });
}
