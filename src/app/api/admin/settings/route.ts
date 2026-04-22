import {
  AVAILABLE_MODELS,
  getSelectedModel,
  setSelectedModel,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  maskApiKey,
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
    const [selectedModel, apiKey] = await Promise.all([
      getSelectedModel(),
      getOpenRouterApiKey(),
    ]);
    return Response.json({
      selectedModel,
      availableModels: AVAILABLE_MODELS,
      apiKeyMasked: maskApiKey(apiKey),
      apiKeyPresent: Boolean(apiKey),
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

    const [selectedModel, apiKey] = await Promise.all([
      getSelectedModel(),
      getOpenRouterApiKey(),
    ]);
    return Response.json({
      ok: true,
      selectedModel,
      apiKeyMasked: maskApiKey(apiKey),
      apiKeyPresent: Boolean(apiKey),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Failed to save setting", details: message }, { status: 500 });
  }
}
