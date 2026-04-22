"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, ArrowLeft, CheckCircle2, AlertTriangle, X } from "lucide-react";

type MealType = "sniadanie_kolacja" | "drugie_sniadanie_deser" | "obiad_zupa" | "obiad_danie_glowne";
type DietType = "meat" | "vegetarian" | "fish" | "legumes" | null;

const MEAL_LABELS: Record<MealType, string> = {
  sniadanie_kolacja: "Śniadanie / Kolacja",
  drugie_sniadanie_deser: "II Śniadanie / Deser",
  obiad_zupa: "Obiad — Zupa",
  obiad_danie_glowne: "Obiad — Danie główne",
};

const DIET_LABELS: Record<Exclude<DietType, null>, string> = {
  meat: "Mięsne",
  vegetarian: "Jarskie",
  fish: "Rybne",
  legumes: "Strączki",
};

interface Dish {
  id: string;
  name: string;
  type: MealType;
  diet: DietType;
  vegFruit: boolean;
  allergens: number[];
  allergenIds: string[];
}

interface Allergen {
  id: string;
  number: number;
  name: string;
  description: string | null;
}

interface Form {
  id: string | null;
  displayName: string;
  mealType: MealType;
  dietType: DietType;
  hasVegFruit: boolean;
  allergenIds: string[];
}

const EMPTY_FORM: Form = {
  id: null,
  displayName: "",
  mealType: "obiad_danie_glowne",
  dietType: "meat",
  hasVegFruit: false,
  allergenIds: [],
};

export default function AdminDishesPage() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMeal, setFilterMeal] = useState<MealType | "all">("all");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const loadAll = async () => {
    const [d, a] = await Promise.all([
      fetch("/api/dishes").then((r) => r.json()),
      fetch("/api/allergens").then((r) => r.json()),
    ]);
    if (d.dishes) setDishes(d.dishes);
    if (a.allergens) setAllergens(a.allergens);
  };

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes
      .filter((d) => (filterMeal === "all" ? true : d.type === filterMeal))
      .filter((d) => (q === "" ? true : d.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [dishes, search, filterMeal]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setStatus(null);
  };

  const openEdit = (d: Dish) => {
    setForm({
      id: d.id,
      displayName: d.name,
      mealType: d.type,
      dietType: d.diet,
      hasVegFruit: d.vegFruit,
      allergenIds: d.allergenIds,
    });
    setStatus(null);
  };

  const save = async () => {
    if (!form) return;
    if (form.displayName.trim().length === 0) {
      setStatus({ kind: "err", msg: "Nazwa wymagana" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dishes", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id ?? undefined,
          displayName: form.displayName.trim(),
          mealType: form.mealType,
          dietType: form.dietType,
          hasVegFruit: form.hasVegFruit,
          allergenIds: form.allergenIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? "Błąd zapisu" });
      } else {
        setStatus({ kind: "ok", msg: form.id ? "Zaktualizowano" : "Dodano" });
        await loadAll();
        setForm(null);
      }
    } catch (e) {
      setStatus({ kind: "err", msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Dish) => {
    if (!confirm(`Usunąć „${d.name}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dishes?id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? "Błąd usuwania" });
      } else {
        setStatus({ kind: "ok", msg: "Usunięto" });
        await loadAll();
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleAllergen = (id: string) => {
    setForm((f) => {
      if (!f) return f;
      const has = f.allergenIds.includes(id);
      return { ...f, allergenIds: has ? f.allergenIds.filter((x) => x !== id) : [...f.allergenIds, id] };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> Wróć do plannera
            </Link>
            <h1 className="text-2xl font-bold text-slate-800">Baza dań</h1>
            <p className="text-slate-500 text-sm">Zarządzaj biblioteką dań używaną przez planer i AI.</p>
          </div>
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" /> Dodaj danie
          </Button>
        </div>

        {status && (
          <div className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${status.kind === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}>
            {status.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {status.msg}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po nazwie…"
              className="pl-8"
            />
          </div>
          <select
            value={filterMeal}
            onChange={(e) => setFilterMeal(e.target.value as MealType | "all")}
            className="px-3 py-2 border border-slate-300 rounded-md bg-white text-sm"
          >
            <option value="all">Wszystkie posiłki</option>
            {(Object.keys(MEAL_LABELS) as MealType[]).map((k) => (
              <option key={k} value={k}>{MEAL_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-6 text-slate-400 text-sm">Ładowanie…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-slate-400 text-sm">Brak dań pasujących do filtrów.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((d) => (
                <li key={d.id} className="p-4 flex items-center gap-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800">{d.name}</span>
                      <Badge variant="outline" className="text-xs">{MEAL_LABELS[d.type]}</Badge>
                      {d.diet && <Badge variant="secondary" className="text-xs">{DIET_LABELS[d.diet]}</Badge>}
                      {d.vegFruit && <Badge className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100">🥕 warzywo/owoc</Badge>}
                    </div>
                    {d.allergens.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">Alergeny: {d.allergens.join(", ")}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)} aria-label="Edytuj">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(d)} aria-label="Usuń" disabled={saving}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-400">{filtered.length} / {dishes.length} dań</p>
      </div>

      {form && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{form.id ? "Edycja dania" : "Nowe danie"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setForm(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nazwa</label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Typ posiłku</label>
                  <select
                    value={form.mealType}
                    onChange={(e) => setForm({ ...form, mealType: e.target.value as MealType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm"
                  >
                    {(Object.keys(MEAL_LABELS) as MealType[]).map((k) => (
                      <option key={k} value={k}>{MEAL_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Dieta</label>
                  <select
                    value={form.dietType ?? ""}
                    onChange={(e) => setForm({ ...form, dietType: (e.target.value || null) as DietType })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm"
                  >
                    <option value="">—</option>
                    {(Object.keys(DIET_LABELS) as Exclude<DietType, null>[]).map((k) => (
                      <option key={k} value={k}>{DIET_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.hasVegFruit}
                  onChange={(e) => setForm({ ...form, hasVegFruit: e.target.checked })}
                />
                Zawiera warzywo / owoc (liczy się do wymogu Sanepid)
              </label>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Alergeny (EU 1169/2011)</label>
                <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto border border-slate-200 rounded-md p-2">
                  {allergens.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-xs text-slate-700 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.allergenIds.includes(a.id)}
                        onChange={() => toggleAllergen(a.id)}
                      />
                      <span className="font-mono text-slate-500 w-5">{a.number}.</span>
                      <span>{a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>Anuluj</Button>
              <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Zapisywanie…" : "Zapisz"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
