"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EU_ALLERGENS } from "@/lib/allergens";
import type { Dish, DietType, MealType } from "@/lib/sanepid-brain";

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

  React.useEffect(() => {
    if (!open || !dish) return;
    setName(dish.name);
    setMealType(dish.type);
    setDietType(dish.diet);
    setHasVegFruit(dish.vegFruit);
    setAllergenNumbers([...dish.allergens].sort((a, b) => a - b));
  }, [open, dish]);

  if (!open || !dish) return null;

  const toggleAllergen = (n: number) => {
    setAllergenNumbers((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b),
    );
  };

  const handleSave = () => {
    onSave({
      ...dish,
      name: name.trim() || dish.name,
      type: mealType,
      diet: dietType,
      vegFruit: hasVegFruit,
      allergens: [...allergenNumbers].sort((a, b) => a - b),
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
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">Zapisz</Button>
        </div>
      </div>
    </div>
  );
}
