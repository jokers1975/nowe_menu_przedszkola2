"use client";

import * as React from "react";
import { Search, Info, Plus, AlertTriangle } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { DietType, MealType } from "@/lib/sanepid-brain";

interface ApiDish {
  id: string | number;
  name: string;
  type: MealType;
  diet: DietType;
  vegFruit: boolean;
  allergens: number[];
}

interface DishPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealType: MealType | "";
  dayLabel: string;
  onSelectDish: (dish: ApiDish) => void;
}

export function DishPickerModal({ open, onOpenChange, mealType, dayLabel, onSelectDish }: DishPickerModalProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dishes, setDishes] = React.useState<ApiDish[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)");

  React.useEffect(() => {
    if (!open || !mealType) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/dishes?mealType=${encodeURIComponent(mealType)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setDishes([]);
        } else {
          setDishes(data.dishes ?? []);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [open, mealType]);

  const getMealTypeLabel = (type: string) => {
    switch (type) {
      case "sniadanie_kolacja": return "Śniadanie / Kolacja";
      case "obiad_zupa": return "Zupę";
      case "obiad_danie_glowne": return "Danie Główne";
      case "drugie_sniadanie_deser": return "II Śniadanie / Deser";
      default: return "Danie";
    }
  };

  const filteredDishes = dishes.filter((dish) =>
    dish.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const Content = () => (
    <div className="flex flex-col h-full sm:h-[60vh]">
      <div className="px-4 pb-4 border-b border-slate-100 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Szukaj w bazie dań..."
            className="pl-9 bg-slate-50 border-slate-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
          <Badge variant="secondary" className="bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer whitespace-nowrap">Wszystkie</Badge>
          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 cursor-pointer whitespace-nowrap">Jarskie 🥬</Badge>
          <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 cursor-pointer whitespace-nowrap">Mięsne 🥩</Badge>
          <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50 cursor-pointer whitespace-nowrap">Rybne 🐟</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="text-center py-10 text-slate-400 text-sm">Ładowanie dań…</div>
        )}

        {error && !loading && (
          <div className="text-center py-10 text-rose-600">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && filteredDishes.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>
              {dishes.length === 0
                ? "Brak dań w bazie dla tego typu posiłku."
                : <>Nie znaleziono dań dla &quot;<strong>{searchQuery}</strong>&quot;</>}
            </p>
          </div>
        )}

        {!loading && !error && filteredDishes.map((dish) => (
          <div
            key={dish.id}
            onClick={() => {
              onSelectDish(dish);
              onOpenChange(false);
            }}
            className="p-3 bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-sm rounded-xl cursor-pointer transition-all flex justify-between items-center group"
          >
            <div>
              <h4 className="font-medium text-slate-800 text-sm">{dish.name}</h4>
              <div className="flex items-center gap-2 mt-1">
                {dish.vegFruit && (
                  <Badge variant="secondary" className="text-[10px] h-5 bg-amber-50 text-amber-700 hover:bg-amber-50">W</Badge>
                )}
                {dish.allergens.length > 0 && (
                  <span className="text-xs text-slate-500">Alergeny: {dish.allergens.join(", ")}</span>
                )}
              </div>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-50 group-hover:bg-emerald-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 transition-colors">
              <Plus className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const title = `Wybierz ${getMealTypeLabel(mealType)}`;
  const description = `Dobierz posiłek na dzień: ${dayLabel}`;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
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
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <Content />
      </DrawerContent>
    </Drawer>
  );
}
