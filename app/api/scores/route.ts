import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { scores } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .select({ id: scores.id, nickname: scores.nickname, score: scores.score, maxCombo: scores.maxCombo })
      .from(scores)
      .orderBy(desc(scores.score), desc(scores.maxCombo), desc(scores.id))
      .limit(10);
    return Response.json({ scores: rows });
  } catch {
    return Response.json({ error: "ranking unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { nickname?: string; score?: number; maxCombo?: number };
    const nickname = (payload.nickname ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
    const score = Math.floor(Number(payload.score));
    const maxCombo = Math.floor(Number(payload.maxCombo));
    if (nickname.length < 2 || !Number.isFinite(score) || score < 0 || score > 10_000_000 || !Number.isFinite(maxCombo) || maxCombo < 0 || maxCombo > 100_000) {
      return Response.json({ error: "invalid score" }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db.insert(scores).values({ nickname, score, maxCombo }).returning();
    return Response.json({ score: row }, { status: 201 });
  } catch {
    return Response.json({ error: "score could not be saved" }, { status: 503 });
  }
}
