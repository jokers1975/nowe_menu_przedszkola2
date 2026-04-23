import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { UnauthorizedError, getCurrentUserId, unauthorizedResponse } from "@/lib/auth";
import { MailerNotConfiguredError, sendMail } from "@/lib/mailer";
import { buildMenuPdf } from "@/lib/pdf/build";
import type { Variant } from "@/lib/pdf/menu-pdf";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Recipient = { label: string; email: string };

function formatDateRangePL(from: string, to: string): string {
  return `${from} – ${to}`;
}

function defaultBody(restaurantName: string | null, from: string, to: string): { text: string; html: string } {
  const greeting = "Dzień dobry,";
  const intro = `w załączniku przesyłamy jadłospis na okres ${formatDateRangePL(from, to)}.`;
  const info = "Menu zostało przygotowane zgodnie z wytycznymi Sanepid i z uwzględnieniem 14 alergenów (EU 1169/2011). W razie pytań prosimy o kontakt zwrotny.";
  const signature = restaurantName ? `Z pozdrowieniami,\n${restaurantName}` : "Z pozdrowieniami";
  const text = `${greeting}\n\n${intro}\n\n${info}\n\n${signature}`;
  const html = `
    <p>${greeting}</p>
    <p>${intro}</p>
    <p style="color:#475569">${info}</p>
    <p style="margin-top:24px">${signature.replace(/\n/g, "<br/>")}</p>
  `;
  return { text, html };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = (await req.json()) as {
      from?: string;
      to?: string;
      variant?: Variant | "both";
      recipientEmails?: string[];
      subject?: string;
      message?: string;
    };

    const { from, to } = body;
    const variants: Variant[] =
      body.variant === "both"
        ? ["parents", "sanepid"]
        : body.variant === "sanepid"
          ? ["sanepid"]
          : ["parents"];

    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return Response.json({ error: "from/to wymagane (YYYY-MM-DD)." }, { status: 400 });
    }

    const [profileRow] = await db
      .select({
        restaurantName: profiles.restaurantName,
        emailRecipients: profiles.emailRecipients,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const savedRecipients = (profileRow?.emailRecipients as Recipient[] | null) ?? [];
    const filter = Array.isArray(body.recipientEmails)
      ? new Set(body.recipientEmails.map((e) => e.toLowerCase()))
      : null;
    const recipients = filter
      ? savedRecipients.filter((r) => filter.has(r.email.toLowerCase()))
      : savedRecipients;

    if (recipients.length === 0) {
      return Response.json(
        { error: "Brak odbiorców — dodaj adresy w ustawieniach restauracji." },
        { status: 400 },
      );
    }

    const pdfs = await Promise.all(
      variants.map((v) => buildMenuPdf({ userId, from, to, variant: v })),
    );
    const attachments = pdfs.map((p) => ({
      filename: p.filename,
      content: p.buffer,
      contentType: "application/pdf",
    }));

    const defaults = defaultBody(profileRow?.restaurantName ?? null, from, to);
    const subject = body.subject?.trim() || `Jadłospis ${formatDateRangePL(from, to)}`;
    const text = body.message?.trim() || defaults.text;
    const html = body.message?.trim() ? text.replace(/\n/g, "<br/>") : defaults.html;

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const r of recipients) {
      try {
        await sendMail({
          to: r.email,
          subject,
          text,
          html,
          attachments,
        });
        results.push({ email: r.email, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ email: r.email, ok: false, error: message });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    return Response.json({ ok: failed.length === 0, sent, failed, total: results.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorizedResponse();
    if (err instanceof MailerNotConfiguredError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/send-menu:", err);
    return Response.json({ error: "Błąd wysyłki menu.", details: message }, { status: 500 });
  }
}
