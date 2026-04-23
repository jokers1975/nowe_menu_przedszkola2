import type { NextRequest } from "next/server";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";
import { buildMenuPdf } from "@/lib/pdf/build";
import type { Variant } from "@/lib/pdf/menu-pdf";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const variant = (req.nextUrl.searchParams.get("variant") ?? "sanepid") as Variant;

    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return Response.json({ error: "from/to wymagane (YYYY-MM-DD)." }, { status: 400 });
    }
    if (variant !== "sanepid" && variant !== "parents") {
      return Response.json({ error: "variant musi być sanepid|parents." }, { status: 400 });
    }

    const { buffer, filename } = await buildMenuPdf({ userId, from, to, variant });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF export error:", err);
    return Response.json({ error: "Błąd generowania PDF.", details: message }, { status: 500 });
  }
}
