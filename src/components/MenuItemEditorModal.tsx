"use client";

import * as React from "react";
import { X, Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EU_ALLERGENS } from "@/lib/allergens";
import type { Dish, DietType, DishIngredient, MealType } from "@/lib/sanepid-brain";

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

interface MenuItemEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dish: Dish | null;
  onSave: (updated: Dish) => void;
}

export function MenuItemEditorModal({ open, onOpenChange, dish, onSave }: MenuItemEditorModalProps) {
  const [name, setName] = React.useState("");
  const [mealType, setMealType] = React.useState<MealType>("obiad_danie_glowne");
  const [dietType, setDietType] = React.useState<DietType>(null);
  const [hasVegFruit, setHasVegFruit] = React.useState(false);
  const [allergenNumbers, setAllergenNumbers] = React.useState<number[]>([]);
  const [ingredients, setIngredients] = React.useState<DishIngredient[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !dish) return;
    setName(dish.name);
    setMealType(dish.type);
    setDietType(dish.diet);
    setHasVegFruit(dish.vegFruit);
    setAllergenNumbers([...dish.allergens].sort((a, b) => a - b));
    setIngredients(dish.ingredients ? dish.ingredients.map((i) => ({ ...i })) : []);
    setError(null);
  }, [open, dish]);

  if (!open || !dish) return null;

  const toggleAllergen = (n: number) => {
    setAllergenNumbers((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b),
    );
  };

  const addIngredient = () => setIngredients((p) => [...p, { name: "", quantity: null, unit: "g" }]);
  const updateIngredient = (idx: number, patch: Partial<DishIngredient>) =>
    setIngredients((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeIngredient = (idx: number) => setIngredients((p) => p.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setError(null);
    const cleanIngredients = ingredients
      .map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: (i.unit || "g").trim() }))
      .filter((i) => i.name.length > 0);

    // Zapisz zmiany dania (nazwa, typ, dieta, vegFruit, alergeny, składniki) do bazy
    // poprzez PUT /api/dishes — wpływa na WSZYSTKIE dni używające tego dania.
    if (typeof dish.id === "string") {
      setSaving(true);
      try {
        const allergenIds = await fetchAllergenIdsByNumber(allergenNumbers);
        const res = await fetch("/api/dishes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: dish.id,
            displayName: name.trim() || dish.name,
            mealType,
            dietType,
            hasVegFruit,
            allergenIds,
            ingredients: cleanIngredients,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Zapis dania nieudany");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    onSave({
      ...dish,
      name: name.trim() || dish.name,
      type: mealType,
      diet: dietType,
      vegFruit: hasVegFruit,
      allergens: [...allergenNumbers].sort((a, b) => a - b),
      ingredients: cleanIngredients,
      preparedProducts: undefined,
    });
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Edycja dania</h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nazwa</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Typ posiłku</label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealType)}
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
                value={dietType ?? ""}
                onChange={(e) => setDietType((e.target.value || null) as DietType)}
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
              checked={hasVegFruit}
              onChange={(e) => setHasVegFruit(e.target.checked)}
            />
            Zawiera warzywo / owoc (liczy się do wymogu Sanepid)
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Alergeny (EU 1169/2011)</label>
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto border border-slate-200 rounded-md p-2">
              {EU_ALLERGENS.map((a) => (
                <label key={a.number} className="flex items-center gap-2 text-xs text-slate-700 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allergenNumbers.includes(a.number)}
                    onChange={() => toggleAllergen(a.number)}
                  />
                  <span className="font-mono text-slate-500 w-5">{a.number}.</span>
                  <span>{a.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-600">Składniki (wydruk Sanepid)</label>
              <Button type="button" variant="outline" size="sm" onClick={addIngredient} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Dodaj składnik
              </Button>
            </div>
            {ingredients.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Brak składników. Nie pojawiają się na kalendarzu ani wydruku dla rodziców.</p>
            ) : (
              <div className="space-y-1 max-h-56 overflow-auto border border-slate-200 rounded-md p-2">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <Input
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                      placeholder="Nazwa składnika"
                      className="flex-1 h-8 text-sm"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={ing.quantity ?? ""}
                      onChange={(e) => updateIngredient(idx, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="ilość"
                      className="w-20 h-8 text-sm"
                    />
                    <select
                      value={ing.unit}
                      onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                      className="h-8 px-2 border border-slate-300 rounded-md bg-white text-sm"
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="szt">szt</option>
                      <option value="łyż">łyż</option>
                    </select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(idx)} className="h-8 w-8" aria-label="Usuń">
                      <Trash2 className="h-3 w-3 text-rose-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Anuluj</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Pomocnik: konwersja numerów EU alergenow na UUIDy z /api/allergens (wymagane przez POST/PUT /api/dishes).
async function fetchAllergenIdsByNumber(numbers: number[]): Promise<string[]> {
  if (numbers.length === 0) return [];
  const res = await fetch("/api/allergens");
  if (!res.ok) return [];
  const data = (await res.json()) as { allergens?: Array<{ id: string; number: number }> };
  const list = data.allergens ?? [];
  const map = new Map<number, string>(list.map((a) => [a.number, a.id]));
  return numbers.map((n) => map.get(n)).filter((x): x is string => typeof x === "string");
}
