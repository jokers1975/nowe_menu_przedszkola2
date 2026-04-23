import {
  AVAILABLE_MODELS,
  getSelectedModel,
  setSelectedModel,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  maskApiKey,
  getSmtpSettings,
  setSmtpSettings,
  type SmtpSettings,
} from "@/lib/app-settings";
import { checkAdmin, forbiddenResponse, getCurrentUser, unauthorizedResponse } from "@/lib/auth";

async function ensureAdminOrForbidden() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  const admin = await checkAdmin();
  if (!admin) return forbiddenResponse();
  return null;
}

export async function GET() {
  const guard = await ensureAdminOrForbidden();
  if (guard) return guard;
  try {
    const [selectedModel, apiKey, smtp] = await Promise.all([
      getSelectedModel(),
      getOpenRouterApiKey(),
      getSmtpSettings(),
    ]);
    return Response.json({
      selectedModel,
      availableModels: AVAILABLE_MODELS,
      apiKeyMasked: maskApiKey(apiKey),
      apiKeyPresent: Boolean(apiKey),
      smtp: {
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        fromEmail: smtp.fromEmail,
        fromName: smtp.fromName,
        secure: smtp.secure,
        passPresent: Boolean(smtp.pass),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Database unavailable", details: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await ensureAdminOrForbidden();
  if (guard) return guard;
  try {
    const body = (await req.json()) as { modelId?: unknown; apiKey?: unknown };

    if (typeof body.modelId === "string" && body.modelId.length > 0) {
      const allowed = AVAILABLE_MODELS.some((m) => m.id === body.modelId);
      if (!allowed) {
        return Response.json({ error: "Unknown model" }, { status: 400 });
      }
      await setSelectedModel(body.modelId);
    }

    if (typeof body.apiKey === "string") {
      await setOpenRouterApiKey(body.apiKey);
    } else if (body.apiKey === null) {
      await setOpenRouterApiKey(null);
    }

    const smtpBody = (body as { smtp?: Partial<SmtpSettings> }).smtp;
    if (smtpBody && typeof smtpBody === "object") {
      const patch: Partial<SmtpSettings> = {};
      if ("host" in smtpBody) patch.host = smtpBody.host ?? null;
      if ("port" in smtpBody) {
        const p = smtpBody.port;
        patch.port = typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
      }
      if ("user" in smtpBody) patch.user = smtpBody.user ?? null;
      if ("pass" in smtpBody && typeof smtpBody.pass === "string") patch.pass = smtpBody.pass;
      if ("fromEmail" in smtpBody) patch.fromEmail = smtpBody.fromEmail ?? null;
      if ("fromName" in smtpBody) patch.fromName = smtpBody.fromName ?? null;
      if ("secure" in smtpBody) patch.secure = Boolean(smtpBody.secure);
      await setSmtpSettings(patch);
    }

    const [selectedModel, apiKey, smtp] = await Promise.all([
      getSelectedModel(),
      getOpenRouterApiKey(),
      getSmtpSettings(),
    ]);
    return Response.json({
      ok: true,
      selectedModel,
      apiKeyMasked: maskApiKey(apiKey),
      apiKeyPresent: Boolean(apiKey),
      smtp: {
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        fromEmail: smtp.fromEmail,
        fromName: smtp.fromName,
        secure: smtp.secure,
        passPresent: Boolean(smtp.pass),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Failed to save setting", details: message }, { status: 500 });
  }
}
