import { checkAdmin, forbiddenResponse, getCurrentUser, unauthorizedResponse } from "@/lib/auth";
import { MailerNotConfiguredError, sendMail } from "@/lib/mailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  if (!(await checkAdmin())) return forbiddenResponse();

  try {
    const body = (await req.json()) as { to?: unknown };
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!to || !EMAIL_RE.test(to)) {
      return Response.json({ error: "Nieprawidłowy adres e-mail." }, { status: 400 });
    }
    const { messageId } = await sendMail({
      to,
      subject: "Test SMTP — Menu Catering",
      text: "To jest test konfiguracji SMTP z aplikacji Menu Catering. Jeśli widzisz tę wiadomość, wysyłka działa.",
    });
    return Response.json({ ok: true, messageId });
  } catch (err) {
    if (err instanceof MailerNotConfiguredError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/admin/settings/smtp-test:", err);
    return Response.json({ error: "Wysyłka testowa nie powiodła się.", details: message }, { status: 500 });
  }
}
