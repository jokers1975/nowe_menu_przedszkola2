"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, Eye, EyeOff, Upload, Trash2 } from "lucide-react";

interface ModelOption {
  id: string;
  label: string;
}

interface SettingsResponse {
  selectedModel: string;
  availableModels: readonly ModelOption[];
  apiKeyMasked: string;
  apiKeyPresent: boolean;
}

export default function AdminSettingsPage() {
  const [models, setModels] = useState<readonly ModelOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [apiKeyMasked, setApiKeyMasked] = useState<string>("");
  const [apiKeyPresent, setApiKeyPresent] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSettings = () => {
    return fetch("/api/admin/settings")
      .then((r) => r.json() as Promise<SettingsResponse | { error: string }>)
      .then((data) => {
        if ("error" in data) {
          setStatus({ kind: "err", msg: data.error });
        } else {
          setModels(data.availableModels);
          setSelected(data.selectedModel);
          setApiKeyMasked(data.apiKeyMasked);
          setApiKeyPresent(data.apiKeyPresent);
        }
      })
      .catch((e) => setStatus({ kind: "err", msg: String(e) }));
  };

  const loadLogo = () => {
    return fetch("/api/me/profile")
      .then((r) => r.json() as Promise<{ logoUrl: string | null } | { error: string }>)
      .then((data) => {
        if ("error" in data) return;
        setLogoUrl(data.logoUrl);
      })
      .catch(() => { /* ignore */ });
  };

  useEffect(() => {
    Promise.all([loadSettings(), loadLogo()]).finally(() => setLoading(false));
  }, []);

  const handleLogoUpload = async (file: File) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      setStatus({ kind: "err", msg: "Dozwolone formaty: PNG, JPEG, WEBP, SVG." });
      return;
    }
    if (file.size > 2_000_000) {
      setStatus({ kind: "err", msg: "Plik zbyt duży — max 2000KB." });
      return;
    }
    setLogoSaving(true);
    setStatus(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? "Błąd zapisu logo." });
      } else {
        setLogoUrl(data.logoUrl);
        setStatus({ kind: "ok", msg: "Logo zapisane." });
      }
    } catch (e) {
      setStatus({ kind: "err", msg: String(e) });
    } finally {
      setLogoSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLogoClear = async () => {
    if (!confirm("Usunąć logo restauracji?")) return;
    setLogoSaving(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      if (res.ok) {
        setLogoUrl(null);
        setStatus({ kind: "ok", msg: "Logo usunięte." });
      }
    } finally {
      setLogoSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const body: { modelId: string; apiKey?: string } = { modelId: selected };
      if (apiKeyInput.trim().length > 0) body.apiKey = apiKeyInput.trim();

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? "Błąd zapisu" });
      } else {
        setStatus({ kind: "ok", msg: "Zapisano." });
        setApiKeyInput("");
        setApiKeyMasked(data.apiKeyMasked ?? "");
        setApiKeyPresent(Boolean(data.apiKeyPresent));
      }
    } catch (e) {
      setStatus({ kind: "err", msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    if (!confirm("Usunąć zapisany klucz OpenRouter?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: null }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiKeyMasked("");
        setApiKeyPresent(false);
        setStatus({ kind: "ok", msg: "Klucz usunięty." });
      } else {
        setStatus({ kind: "err", msg: data.error ?? "Błąd" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Ustawienia systemu</h1>
          <p className="text-slate-500">Konfiguracja OpenRouter: klucz API i model używany do generowania jadłospisów.</p>
        </div>

        {loading ? (
          <p className="text-slate-400 text-sm">Ładowanie…</p>
        ) : (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Klucz OpenRouter API
                </label>
                {apiKeyPresent && (
                  <p className="text-xs text-slate-500 mb-2">
                    Aktualnie zapisany: <code className="bg-slate-100 px-1 py-0.5 rounded">{apiKeyMasked}</code>
                  </p>
                )}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={apiKeyPresent ? "Wpisz, aby nadpisać…" : "sk-or-v1-…"}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showKey ? "Ukryj" : "Pokaż"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {apiKeyPresent && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearKey}
                      disabled={saving}
                    >
                      Usuń
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Zdobądź klucz na <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">openrouter.ai/keys</a>.
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Logo restauracji (na wydruku „dla rodziców")
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400 text-center px-1">brak logo</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleLogoUpload(file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={logoSaving}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {logoUrl ? "Zmień" : "Wgraj"}
                      </Button>
                      {logoUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleLogoClear}
                          disabled={logoSaving}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Usuń
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      PNG/JPEG/WEBP/SVG do 2000KB. Pokazywane w nagłówku wydruku dla rodziców.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Model AI
                </label>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  ID: <code className="bg-slate-100 px-1 py-0.5 rounded">{selected}</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={saving || !selected}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? "Zapisywanie…" : "Zapisz"}
              </Button>

              {status && (
                <span className={`text-sm flex items-center gap-1 ${status.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
                  {status.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {status.msg}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
