import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";
import { ALL_SLOTS, type SlotType } from "@/lib/sanepid-brain";

const MAX_LOGO_BYTES = 2_800_000; // ~2.8 MB zapisanego data URI (2MB pliku * ~1.37 base64)

function sanitizeSlots(input: unknown): SlotType[] {
  if (!Array.isArray(input)) return ALL_SLOTS;
  const valid = new Set<SlotType>();
  for (const s of input) {
    if (typeof s === "string" && (ALL_SLOTS as string[]).includes(s)) {
      valid.add(s as SlotType);
    }
  }
  return ALL_SLOTS.filter((s) => valid.has(s));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailRecipient = { label: string; email: string };

function sanitizeRecipients(input: unknown): EmailRecipient[] {
  if (!Array.isArray(input)) return [];
  const out: EmailRecipient[] = [];
  const seen = new Set<string>();
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const label = typeof (r as { label?: unknown }).label === "string" ? (r as { label: string }).label.trim() : "";
    const email = typeof (r as { email?: unknown }).email === "string" ? (r as { email: string }).email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email) || email.length > 254) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ label: label.slice(0, 100), email });
    if (out.length >= 50) break;
  }
  return out;
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const rows = await db
      .select({
        logoUrl: profiles.logoUrl,
        restaurantName: profiles.restaurantName,
        servedSlots: profiles.servedSlots,
        emailRecipients: profiles.emailRecipients,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    const row = rows[0];
    return Response.json({
      logoUrl: row?.logoUrl ?? null,
      restaurantName: row?.restaurantName ?? null,
      servedSlots: (row?.servedSlots as SlotType[] | null) ?? ALL_SLOTS,
      emailRecipients: (row?.emailRecipients as EmailRecipient[] | null) ?? [],
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = (await req.json()) as {
      logoUrl?: string | null;
      restaurantName?: string | null;
      servedSlots?: string[];
      emailRecipients?: unknown;
    };

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if ("logoUrl" in body) {
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
      patch.logoUrl = normalized;
    }

    if ("restaurantName" in body) {
      const raw = body.restaurantName;
      patch.restaurantName = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
    }

    if ("servedSlots" in body) {
      patch.servedSlots = sanitizeSlots(body.servedSlots);
    }

    if ("emailRecipients" in body) {
      patch.emailRecipients = sanitizeRecipients(body.emailRecipients);
    }

    await db
      .insert(profiles)
      .values({ id: userId, ...patch })
      .onConflictDoUpdate({
        target: profiles.id,
        set: patch,
      });

    const [row] = await db
      .select({
        logoUrl: profiles.logoUrl,
        restaurantName: profiles.restaurantName,
        servedSlots: profiles.servedSlots,
        emailRecipients: profiles.emailRecipients,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    return Response.json({
      ok: true,
      logoUrl: row?.logoUrl ?? null,
      restaurantName: row?.restaurantName ?? null,
      servedSlots: (row?.servedSlots as SlotType[] | null) ?? ALL_SLOTS,
      emailRecipients: (row?.emailRecipients as EmailRecipient[] | null) ?? [],
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("PUT /api/me/profile:", err);
    return Response.json({ error: "Błąd zapisu profilu.", details: message }, { status: 500 });
  }
}
