"use client";

import * as React from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
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
  const isDesktop = useMediaQuery("(min-width: 768px)");

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

  if (!dish) return null;

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

  const Content = () => (
    <div className="flex flex-col flex-1 min-h-0 sm:h-auto">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4">
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
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">—</option>
              {(Object.keys(DIET_LABELS) as Exclude<DietType, null>[]).map((k) => (
                <option key={k} value={k}>{DIET_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={hasVegFruit}
            onChange={(e) => setHasVegFruit(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Zawiera warzywo / owoc (liczy się do wymogu Sanepid)
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-2">Alergeny (EU 1169/2011)</label>
          <div className="grid grid-cols-2 gap-1 border border-slate-200 rounded-md p-2">
            {EU_ALLERGENS.map((a) => (
              <label
                key={a.number}
                className="flex items-center gap-2 text-xs text-slate-700 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={allergenNumbers.includes(a.number)}
                  onChange={() => toggleAllergen(a.number)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-mono text-slate-500 w-5">{a.number}.</span>
                <span>{a.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 p-4 flex justify-end gap-2 bg-slate-50">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
        <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">Zapisz</Button>
      </div>
    </div>
  );

  const title = `Edytuj: ${dish.name}`;
  const description = "Nazwa, typ posiłku, dieta, alergeny i oznaczenie warzywo/owoc.";

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Content />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <Content />
      </DrawerContent>
    </Drawer>
  );
}
