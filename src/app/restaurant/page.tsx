"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { ALL_SLOTS, SLOT_LABELS, type SlotType } from "@/lib/sanepid-brain";

interface ProfileResponse {
  logoUrl: string | null;
  restaurantName: string | null;
  servedSlots: SlotType[];
}

export default function RestaurantSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const [restaurantName, setRestaurantName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [servedSlots, setServedSlots] = useState<SlotType[]>(ALL_SLOTS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    return fetch("/api/me/profile")
      .then((r) => r.json() as Promise<ProfileResponse | { error: string }>)
      .then((data) => {
        if ("error" in data) {
          setStatus({ kind: "err", msg: data.error });
        } else {
          setRestaurantName(data.restaurantName ?? "");
          setLogoUrl(data.logoUrl);
          setServedSlots(data.servedSlots.length > 0 ? data.servedSlots : ALL_SLOTS);
        }
      })
      .catch((e) => setStatus({ kind: "err", msg: String(e) }));
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const toggleSlot = (slot: SlotType) => {
    setServedSlots((prev) =>
      prev.includes(slot)
        ? prev.filter((s) => s !== slot)
        : ALL_SLOTS.filter((s) => prev.includes(s) || s === slot),
    );
  };

  const saveProfile = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: restaurantName.trim() || null,
          servedSlots,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? "Błąd zapisu." });
      } else {
        setStatus({ kind: "ok", msg: "Zapisano." });
      }
    } catch (e) {
      setStatus({ kind: "err", msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2_000_000) {
      setStatus({ kind: "err", msg: "Plik zbyt duży (max 2MB)." });
      return;
    }
    setLogoSaving(true);
    setStatus(null);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
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
      const data = await res.json();
      if (res.ok) {
        setLogoUrl(null);
        setStatus({ kind: "ok", msg: "Logo usunięte." });
      } else {
        setStatus({ kind: "err", msg: data.error ?? "Błąd usuwania." });
      }
    } finally {
      setLogoSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Wróć do plannera
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Ustawienia restauracji</h1>
          <p className="text-slate-500 text-sm">Nazwa, logo i lista posiłków wydawanych przez Twoją placówkę.</p>
        </div>

        {status && (
          <div className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${status.kind === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}>
            {status.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {status.msg}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 text-sm">Ładowanie…</p>
        ) : (
          <>
            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nazwa restauracji</label>
                <Input
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="np. Przedszkole Słoneczko — kuchnia"
                />
                <p className="text-xs text-slate-500 mt-1">Pojawia się w nagłówku wydruku PDF dla rodziców.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Logo restauracji</label>
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
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={logoSaving}>
                        <Upload className="mr-2 h-4 w-4" />
                        {logoUrl ? "Zmień" : "Wgraj"}
                      </Button>
                      {logoUrl && (
                        <Button type="button" variant="outline" onClick={handleLogoClear} disabled={logoSaving}>
                          <Trash2 className="mr-2 h-4 w-4" /> Usuń
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">PNG/JPEG/WEBP/SVG do 2000KB.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Wydawane posiłki</h2>
                <p className="text-xs text-slate-500">Zaznacz typy posiłków, które wydaje Twoja placówka. Niezaznaczone nie będą pojawiać się w kalendarzu ani w wydrukach PDF.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_SLOTS.map((slot) => (
                  <label key={slot} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={servedSlots.includes(slot)}
                      onChange={() => toggleSlot(slot)}
                    />
                    <span className="text-sm text-slate-700">{SLOT_LABELS[slot]}</span>
                  </label>
                ))}
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={saveProfile} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Zapisywanie…" : "Zapisz ustawienia"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
