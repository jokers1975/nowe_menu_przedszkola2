import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export const AVAILABLE_MODELS = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (domyślny — tani, szybki)" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (tani, b. dobry)" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (tani)" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 (wyższa jakość)" },
  { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7 (najwyższa jakość)" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
] as const;

async function getRow() {
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return rows[0];
}

export async function getSelectedModel(): Promise<string> {
  const row = await getRow();
  return row?.selectedModel ?? DEFAULT_MODEL;
}

export async function setSelectedModel(modelId: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: 1, selectedModel: modelId })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { selectedModel: modelId, updatedAt: new Date() },
    });
}

export async function getOpenRouterApiKey(): Promise<string | null> {
  const row = await getRow();
  return row?.openrouterApiKey ?? process.env.OPENROUTER_API_KEY ?? null;
}

export async function setOpenRouterApiKey(key: string | null): Promise<void> {
  const trimmed = key && key.trim().length > 0 ? key.trim() : null;
  await db
    .insert(appSettings)
    .values({ id: 1, openrouterApiKey: trimmed })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { openrouterApiKey: trimmed, updatedAt: new Date() },
    });
}

export function maskApiKey(key: string | null): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export type SmtpSettings = {
  host: string | null;
  port: number | null;
  user: string | null;
  pass: string | null;
  fromEmail: string | null;
  fromName: string | null;
  secure: boolean;
};

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const row = await getRow();
  return {
    host: row?.smtpHost ?? null,
    port: row?.smtpPort ?? null,
    user: row?.smtpUser ?? null,
    pass: row?.smtpPass ?? null,
    fromEmail: row?.smtpFromEmail ?? null,
    fromName: row?.smtpFromName ?? null,
    secure: row?.smtpSecure ?? true,
  };
}

export async function setSmtpSettings(patch: Partial<SmtpSettings>): Promise<void> {
  const db_patch: Record<string, unknown> = { updatedAt: new Date() };
  if ("host" in patch) db_patch.smtpHost = patch.host?.trim() || null;
  if ("port" in patch) db_patch.smtpPort = patch.port ?? null;
  if ("user" in patch) db_patch.smtpUser = patch.user?.trim() || null;
  if ("pass" in patch) db_patch.smtpPass = patch.pass && patch.pass.length > 0 ? patch.pass : null;
  if ("fromEmail" in patch) db_patch.smtpFromEmail = patch.fromEmail?.trim() || null;
  if ("fromName" in patch) db_patch.smtpFromName = patch.fromName?.trim() || null;
  if ("secure" in patch) db_patch.smtpSecure = patch.secure ?? true;

  await db
    .insert(appSettings)
    .values({ id: 1, ...db_patch })
    .onConflictDoUpdate({ target: appSettings.id, set: db_patch });
}
