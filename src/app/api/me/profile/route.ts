import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";

const MAX_LOGO_BYTES = 2_800_000; // ~2.8 MB zapisanego data URI (2MB pliku * ~1.37 base64)

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const rows = await db
      .select({ logoUrl: profiles.logoUrl })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return Response.json({ logoUrl: rows[0]?.logoUrl ?? null });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = (await req.json()) as { logoUrl?: string | null };
    const raw = body.logoUrl;

    const normalized: string | null =
      typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

    if (normalized) {
      if (!normalized.startsWith("data:image/")) {
        return Response.json({ error: "Logo musi być data URI (image/png, image/jpeg, image/webp, image/svg+xml)." }, { status: 400 });
      }
      if (normalized.length > MAX_LOGO_BYTES) {
        return Response.json({ error: "Logo zbyt duże — max ~2000KB pliku." }, { status: 400 });
      }
    }

    await db
      .insert(profiles)
      .values({ id: userId, logoUrl: normalized })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { logoUrl: normalized, updatedAt: new Date() },
      });

    return Response.json({ ok: true, logoUrl: normalized });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("PUT /api/me/profile:", err);
    return Response.json({ error: "Błąd zapisu profilu.", details: message }, { status: 500 });
  }
}
