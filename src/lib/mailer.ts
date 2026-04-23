import nodemailer, { type Transporter } from "nodemailer";
import { getSmtpSettings, type SmtpSettings } from "@/lib/app-settings";

export class MailerNotConfiguredError extends Error {
  constructor(message = "SMTP nie jest skonfigurowany.") {
    super(message);
    this.name = "MailerNotConfiguredError";
  }
}

export type Attachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendArgs = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
};

function requireSmtp(s: SmtpSettings): asserts s is SmtpSettings & {
  host: string;
  port: number;
  fromEmail: string;
} {
  if (!s.host || !s.port || !s.fromEmail) {
    throw new MailerNotConfiguredError(
      "Brakuje host, port lub adresu nadawcy — uzupełnij /admin/settings.",
    );
  }
}

function buildTransport(s: SmtpSettings): Transporter {
  requireSmtp(s);
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user && s.pass ? { user: s.user, pass: s.pass } : undefined,
  });
}

function formatFrom(s: SmtpSettings): string {
  const email = s.fromEmail!;
  return s.fromName ? `"${s.fromName.replace(/"/g, "'")}" <${email}>` : email;
}

export async function sendMail(args: SendArgs): Promise<{ messageId: string }> {
  const smtp = await getSmtpSettings();
  const transport = buildTransport(smtp);
  const info = await transport.sendMail({
    from: formatFrom(smtp),
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    attachments: args.attachments,
  });
  return { messageId: info.messageId };
}

export async function verifySmtp(): Promise<void> {
  const smtp = await getSmtpSettings();
  const transport = buildTransport(smtp);
  await transport.verify();
}
