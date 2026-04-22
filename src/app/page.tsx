"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { format, addDays, startOfWeek } from "date-fns";
import { pl } from "date-fns/locale";
import { Calendar, ChefHat, FileText, Settings, Plus, Menu as MenuIcon, AlertTriangle, CheckCircle2, X, Pencil, Download, ChevronLeft, ChevronRight, Shield, Sparkles } from "lucide-react";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DishPickerModal } from "@/components/DishPickerModal";
import { MenuItemEditorModal } from "@/components/MenuItemEditorModal";
import { UserBar } from "@/components/UserBar";
import { useRole } from "@/hooks/use-role";
import { validateWeek, type DaySchedule, type Dish, type MealType } from "@/lib/sanepid-brain";

const MEAL_CONFIG: Record<MealType, { label: string; shortLabel: string; icon: string }> = {
  sniadanie_kolacja: { label: "Śniadanie / Kolacja", shortLabel: "Śniadanie", icon: "🌅" },
  drugie_sniadanie_deser: { label: "II Śniadanie / Deser", shortLabel: "II śniadanie", icon: "🥪" },
  obiad_zupa: { label: "Obiad - Zupa", shortLabel: "Zupa", icon: "🍲" },
  obiad_danie_glowne: { label: "Obiad - Danie Główne", shortLabel: "Danie gł.", icon: "🍽️" },
};

// Kolory kart na widoku mobilnym — jeden kolor na typ posiłku (inspirowane referencją aplikacja.png)
const MEAL_COLOR: Record<MealType, { card: string; chip: string; timeLabel: string }> = {
  sniadanie_kolacja: {
    card: "bg-gradient-to-br from-sky-400 to-sky-500 text-white",
    chip: "bg-white/20 text-white",
    timeLabel: "text-sky-100",
  },
  drugie_sniadanie_deser: {
    card: "bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950",
    chip: "bg-amber-950/10 text-amber-950",
    timeLabel: "text-amber-900",
  },
  obiad_zupa: {
    card: "bg-gradient-to-br from-orange-500 to-orange-600 text-white",
    chip: "bg-white/20 text-white",
    timeLabel: "text-orange-100",
  },
  obiad_danie_glowne: {
    card: "bg-gradient-to-br from-violet-500 to-violet-600 text-white",
    chip: "bg-white/20 text-white",
    timeLabel: "text-violet-100",
  },
};

const MEAL_ORDER: MealType[] = ["sniadanie_kolacja", "drugie_sniadanie_deser", "obiad_zupa", "obiad_danie_glowne"];

type ComplianceStatus = "ok" | "warn" | "error";
type ComplianceMetric = {
  key: string;
  label: string;
  status: ComplianceStatus;
  value: string;
  detail?: string;
};
type ComplianceResponse = {
  metrics: ComplianceMetric[];
  aiWarnings: string[];
  serverWarnings: string[];
  historyCount: number;
  historyDays: number;
};

const DAY_INITIAL = ["P", "W", "Ś", "C", "P"]; // Pn Wt Śr Cz Pt

export default function Home() {
  const { isAdmin } = useRole();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const workingDays = useMemo(() => [0, 1, 2, 3, 4].map(i => addDays(weekStart, i)), [weekStart]);
  const isCurrentWeek = useMemo(
    () => format(weekStart, "yyyy-MM-dd") === format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    [weekStart],
  );
  const goToWeek = (offsetDays: number) => setWeekStart((d) => addDays(d, offsetDays));
  const goToToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const [schedule, setSchedule] = useState<DaySchedule[]>(() =>
    workingDays.map(date => ({ date, meals: {} }))
  );
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const today = new Date().getDay();
    // Pon=1..Pt=5 → index 0..4; weekend → 0
    if (today === 0 || today === 6) return 0;
    return today - 1;
  });

  const hydrateWeek = async (signal?: AbortSignal) => {
    const from = format(workingDays[0], "yyyy-MM-dd");
    const to = format(workingDays[4], "yyyy-MM-dd");
    const r = await fetch(`/api/menu-items?from=${from}&to=${to}`, { signal });
    const data = await r.json();
    if (data.error) {
      setApiError(data.error);
      return;
    }
    setSchedule(workingDays.map((date) => {
      const dayKey = format(date, "yyyy-MM-dd");
      const slotMatches = (data.items as { date: string; mealType: MealType; dish: Dish }[])
        .filter((x) => x.date === dayKey);
      const meals: Partial<Record<MealType, Dish>> = {};
      for (const slot of slotMatches) meals[slot.mealType] = slot.dish;
      return { date, meals };
    }));
  };

  // Hydrate from API whenever the visible week changes
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setApiError(null);
    setSchedule(workingDays.map(date => ({ date, meals: {} })));
    hydrateWeek(controller.signal)
      .catch((e) => { if (e.name !== "AbortError") setApiError(String(e)); })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingDays]);

  const persistDish = async (dayIndex: number, mealType: MealType, dish: Dish) => {
    try {
      const date = format(workingDays[dayIndex], "yyyy-MM-dd");
      const res = await fetch("/api/menu-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, dish }),
      });
      const data = await res.json();
      if (!res.ok) setApiError(data.error ?? "Błąd zapisu.");
      else setApiError(null);
    } catch (e) {
      setApiError(String(e));
    }
  };

  const deleteDish = async (dayIndex: number, mealType: MealType) => {
    try {
      const date = format(workingDays[dayIndex], "yyyy-MM-dd");
      const res = await fetch(`/api/menu-items?date=${date}&mealType=${mealType}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setApiError(data.error ?? "Błąd usuwania.");
      } else {
        setApiError(null);
      }
    } catch (e) {
      setApiError(String(e));
    }
  };

  const deleteRange = async () => {
    try {
      const from = format(workingDays[0], "yyyy-MM-dd");
      const to = format(workingDays[4], "yyyy-MM-dd");
      const res = await fetch(`/api/menu-items?from=${from}&to=${to}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setApiError(data.error ?? "Błąd czyszczenia.");
      } else {
        setApiError(null);
      }
    } catch (e) {
      setApiError(String(e));
    }
  };

  const [pickerState, setPickerState] = useState<{
    open: boolean;
    mealType: MealType | "";
    dayIndex: number;
  }>({ open: false, mealType: "", dayIndex: -1 });

  const [editorState, setEditorState] = useState<{
    open: boolean;
    dayIndex: number;
    mealType: MealType | "";
  }>({ open: false, dayIndex: -1, mealType: "" });

  const handleOpenPicker = (mealType: MealType, dayIndex: number) => {
    setPickerState({ open: true, mealType, dayIndex });
  };

  const handleOpenEditor = (dayIndex: number, mealType: MealType) => {
    setEditorState({ open: true, dayIndex, mealType });
  };

  const handleSaveEditor = (updated: Dish) => {
    if (editorState.dayIndex === -1 || !editorState.mealType) return;
    const { dayIndex, mealType } = editorState;
    setSchedule(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      return {
        ...day,
        meals: { ...day.meals, [mealType as MealType]: updated },
      };
    }));
    void persistDish(dayIndex, mealType as MealType, updated);
  };

  const editingDish = editorState.dayIndex >= 0 && editorState.mealType
    ? schedule[editorState.dayIndex]?.meals[editorState.mealType as MealType] ?? null
    : null;

  const handleSelectDish = (dish: {
    id: string | number;
    name: string;
    type: MealType;
    diet: Dish["diet"];
    vegFruit?: boolean;
    allergens?: number[];
    processingMethod?: Dish["processingMethod"];
  }) => {
    if (pickerState.dayIndex === -1 || !pickerState.mealType) return;
    const { dayIndex, mealType } = pickerState;
    const newDish: Dish = {
      id: dish.id,
      name: dish.name,
      type: dish.type,
      diet: dish.diet,
      vegFruit: dish.vegFruit || false,
      allergens: dish.allergens || [],
      processingMethod: dish.processingMethod,
    };
    setSchedule(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      return { ...day, meals: { ...day.meals, [mealType as MealType]: newDish } };
    }));
    void persistDish(dayIndex, mealType as MealType, newDish);
  };

  const handleRemoveDish = (dayIndex: number, mealType: MealType) => {
    setSchedule(prev => prev.map((day, idx) => {
      if (idx !== dayIndex) return day;
      const newMeals = { ...day.meals };
      delete newMeals[mealType];
      return { ...day, meals: newMeals };
    }));
    void deleteDish(dayIndex, mealType);
  };

  const handleClearWeek = () => {
    setSchedule(workingDays.map(date => ({ date, meals: {} })));
    void deleteRange();
  };

  const validation = useMemo(() => validateWeek(schedule), [schedule]);
  const hasIssues = validation.errors.length > 0 || validation.warnings.length > 0;
  const totalPlanned = schedule.reduce((sum, day) => sum + Object.keys(day.meals).length, 0);

  const [generating, setGenerating] = useState(false);
  const [compliance, setCompliance] = useState<ComplianceResponse | null>(null);
  const [complianceOpen, setComplianceOpen] = useState(false);

  const exportPdf = (variant: "sanepid" | "parents") => {
    const from = format(workingDays[0], "yyyy-MM-dd");
    const to = format(workingDays[4], "yyyy-MM-dd");
    window.open(`/api/export/pdf?variant=${variant}&from=${from}&to=${to}`, "_blank");
  };

  const handleAI = async () => {
    setGenerating(true);
    setApiError(null);
    try {
      const from = format(workingDays[0], "yyyy-MM-dd");
      const to = format(workingDays[4], "yyyy-MM-dd");
      const r = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        setApiError(data.error ?? "Błąd generowania.");
        return;
      }
      const items = data.items as { date: string; mealType: MealType; dish: Dish }[];
      if (data.compliance) {
        setCompliance(data.compliance as ComplianceResponse);
        setComplianceOpen(true);
      }

      setSchedule((prev) =>
        prev.map((day) => {
          const dayKey = format(day.date, "yyyy-MM-dd");
          const slotMatches = items.filter((x) => x.date === dayKey);
          if (slotMatches.length === 0) return day;
          const meals: Partial<Record<MealType, Dish>> = { ...day.meals };
          for (const slot of slotMatches) meals[slot.mealType] = slot.dish;
          return { ...day, meals };
        }),
      );

      const results = await Promise.allSettled(
        items.map((it) => {
          const dayIndex = workingDays.findIndex((d) => format(d, "yyyy-MM-dd") === it.date);
          if (dayIndex < 0) return Promise.resolve();
          return persistDish(dayIndex, it.mealType, it.dish);
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) setApiError(`Nie zapisano ${failed} z ${items.length} pozycji.`);

      // Refetch z bazy — autorytatywny stan, żeby nic nie "znikało"
      await hydrateWeek();
    } catch (e) {
      setApiError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 bg-white border-r border-slate-200 md:flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <ChefHat className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="font-bold text-lg text-slate-800">Najlepszy Catering</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Button variant="secondary" className="w-full justify-start text-emerald-700 bg-emerald-50 hover:bg-emerald-100 shadow-none">
            <Calendar className="mr-3 h-5 w-5" />
            Planer Menu
          </Button>
          {isAdmin && (
            <>
              <div className="pt-2 pb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Administracja
              </div>
              <Link href="/admin/dishes" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
                <FileText className="mr-3 h-5 w-5" />
                Baza Dań
              </Link>
              <Link href="/admin/users" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
                <Shield className="mr-3 h-5 w-5" />
                Użytkownicy
              </Link>
              <Link href="/admin/settings" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
                <Settings className="mr-3 h-5 w-5" />
                Ustawienia
              </Link>
            </>
          )}
        </nav>

        {/* Stats Box */}
        <div className="m-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs font-medium text-slate-500 uppercase">Podsumowanie tygodnia</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
             <div><span className="font-bold text-slate-700">{validation.summary.totalMeat}</span> Mięsne</div>
             <div><span className="font-bold text-slate-700">{validation.summary.totalVeg}</span> Jarskie</div>
             <div><span className="font-bold text-slate-700">{validation.summary.totalFish}</span> Rybne</div>
             <div><span className="font-bold text-slate-700">{validation.summary.totalLegumes}</span> Strączki</div>
          </div>
        </div>

        <UserBar />
      </aside>

      {/* DESKTOP Main Content */}
      <main className="hidden md:flex flex-1 flex-col h-full overflow-hidden">
        {/* Dashboard / Calendar Space Planner */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {loading && (
            <div className="mb-4 px-3 py-2 rounded-md bg-slate-100 text-slate-600 text-sm">
              Ładowanie jadłospisu…
            </div>
          )}
          {apiError && (
            <div className="mb-4 px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between gap-3">
              <span>⚠ {apiError}</span>
              <button
                onClick={() => setApiError(null)}
                className="text-rose-600 hover:text-rose-800"
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-800">Jadłospis Tygodniowy</h2>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToWeek(-7)}
                  aria-label="Poprzedni tydzień"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-slate-600 text-sm font-medium min-w-[180px] text-center">
                  {format(workingDays[0], 'd MMM', { locale: pl })} – {format(workingDays[4], 'd MMM yyyy', { locale: pl })}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => goToWeek(7)}
                  aria-label="Następny tydzień"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {!isCurrentWeek && (
                  <Button variant="ghost" size="sm" onClick={goToToday} className="text-emerald-700">
                    Dziś
                  </Button>
                )}
                <span className="ml-2 text-xs bg-slate-100 rounded-full px-2 py-1 font-medium text-slate-600">
                  {totalPlanned} / {workingDays.length * MEAL_ORDER.length} posiłków
                </span>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleClearWeek} variant="outline" className="border-slate-300" disabled={totalPlanned === 0}>
                Wyczyść tydzień
              </Button>
              <Button
                onClick={() => exportPdf("parents")}
                variant="outline"
                className="border-slate-300"
                disabled={totalPlanned === 0}
              >
                <Download className="mr-2 h-4 w-4" /> PDF rodzice
              </Button>
              <Button
                onClick={() => exportPdf("sanepid")}
                variant="outline"
                className="border-slate-300"
                disabled={totalPlanned === 0}
              >
                <Download className="mr-2 h-4 w-4" /> PDF Sanepid
              </Button>
              <Button
                onClick={handleAI}
                disabled={generating}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                {generating ? "Generowanie…" : "Generuj AI"}
              </Button>
            </div>
          </div>

          {/* Validation Banner */}
          {hasIssues && (
            <div className={`mb-6 p-4 rounded-xl border ${validation.errors.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex gap-3">
                <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${validation.errors.length > 0 ? 'text-rose-600' : 'text-amber-600'}`} />
                <div className="text-sm">
                  <p className={`font-semibold ${validation.errors.length > 0 ? 'text-rose-800' : 'text-amber-800'}`}>
                    {validation.errors.length > 0 ? 'Wykryto naruszenia wymogów Sanepid' : 'Sugestie ekspertów'}
                  </p>
                  <ul className="mt-1 space-y-1 text-slate-700 list-disc list-inside">
                    {validation.errors.map((err, i) => <li key={`e-${i}`}>{err}</li>)}
                    {validation.warnings.map((warn, i) => <li key={`w-${i}`}>{warn}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!hasIssues && totalPlanned > 0 && (
            <div className="mb-6 p-4 rounded-xl border bg-emerald-50 border-emerald-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Wszystko zgodne z Sanepid 👌</p>
              </div>
            </div>
          )}

          {/* 3-Panel Board */}
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {schedule.map((day, dayIndex) => {
              const dateKey = format(day.date, 'yyyy-MM-dd');
              const issues = validation.dailyIssues[dateKey] || [];
              const dayName = format(day.date, 'EEEE', { locale: pl });
              const dayDate = format(day.date, 'd MMM', { locale: pl });

              return (
                <div key={dateKey} className="min-w-[320px] max-w-sm flex-none snap-center">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 h-full shadow-sm">
                    <div className="border-b border-slate-100 pb-3 mb-4 flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-slate-800 capitalize">{dayName}</h3>
                        <p className="text-sm text-slate-500">{dayDate}, 2026</p>
                      </div>
                      {issues.length > 0 && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          ⚠ {issues.length}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-3">
                      {MEAL_ORDER.map(mealType => {
                        const dish = day.meals[mealType];
                        const config = MEAL_CONFIG[mealType];

                        if (dish) {
                          return (
                            <div
                              key={mealType}
                              className="p-3 border border-slate-100 bg-slate-50 rounded-lg hover:border-emerald-200 transition-colors group relative"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{config.icon}</span>
                                <span className="font-medium text-xs text-slate-600">{config.label}</span>
                                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleOpenEditor(dayIndex, mealType)}
                                    className="text-slate-400 hover:text-emerald-600"
                                    aria-label="Edytuj danie"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveDish(dayIndex, mealType)}
                                    className="text-slate-400 hover:text-rose-600"
                                    aria-label="Usuń danie"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-sm text-slate-800 font-medium leading-snug">{dish.name}</p>
                              <div className="mt-2 flex gap-1 flex-wrap">
                                {dish.vegFruit && (
                                  <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">W</span>
                                )}
                                {dish.diet === 'meat' && <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">Mięso 🥩</span>}
                                {dish.diet === 'vegetarian' && <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Jarskie 🥬</span>}
                                {dish.diet === 'fish' && <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">Ryba 🐟</span>}
                                {dish.diet === 'legumes' && <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20">Strączki 🫘</span>}
                                {dish.allergens.length > 0 && (
                                  <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">A: {dish.allergens.join(", ")}</span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={mealType}
                            onClick={() => handleOpenPicker(mealType, dayIndex)}
                            className="p-3 border border-slate-200 rounded-lg border-dashed text-slate-400 flex items-center justify-center hover:bg-emerald-50/30 hover:border-emerald-300 hover:text-emerald-600 transition-colors cursor-pointer min-h-20"
                          >
                            <div className="text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <span>{config.icon}</span>
                                <Plus className="h-4 w-4" />
                              </div>
                              <span className="text-[11px] font-medium block mt-1">{config.label}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Daily issues */}
                      {issues.length > 0 && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
                          {issues.map((issue, i) => <div key={i}>• {issue}</div>)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </main>

      {/* MOBILE Layout — pionowy pasek dni + wybrany dzień jako kolorowe karty */}
      <div className="md:hidden flex w-full h-full">
        {/* Lewy pasek dni */}
        <nav className="w-16 bg-slate-900 text-white flex flex-col items-center py-3 gap-2 shrink-0">
          <Drawer>
            <DrawerTrigger asChild>
              <button
                className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Menu"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Menu Główne</DrawerTitle>
                <DrawerDescription className="sr-only">Nawigacja</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 space-y-3 pb-8">
                <Button variant="secondary" className="w-full justify-start text-emerald-700 bg-emerald-50">
                  <Calendar className="mr-3 h-5 w-5" /> Planer Menu
                </Button>
                {isAdmin && (
                  <>
                    <div className="pt-2 pb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Administracja
                    </div>
                    <Link href="/admin/dishes" className={buttonVariants({ variant: "outline" }) + " w-full justify-start"}>
                      <FileText className="mr-3 h-5 w-5" /> Baza Dań
                    </Link>
                    <Link href="/admin/users" className={buttonVariants({ variant: "outline" }) + " w-full justify-start"}>
                      <Shield className="mr-3 h-5 w-5" /> Użytkownicy
                    </Link>
                    <Link href="/admin/settings" className={buttonVariants({ variant: "outline" }) + " w-full justify-start"}>
                      <Settings className="mr-3 h-5 w-5" /> Ustawienia
                    </Link>
                  </>
                )}
              </div>
            </DrawerContent>
          </Drawer>

          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            {workingDays.map((day, idx) => {
              const isActive = idx === selectedDayIndex;
              const dayNum = format(day, "d");
              return (
                <button
                  key={format(day, "yyyy-MM-dd")}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`w-11 h-14 rounded-xl flex flex-col items-center justify-center transition-all ${
                    isActive
                      ? "bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/30 scale-105"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                  aria-label={format(day, "EEEE, d MMMM", { locale: pl })}
                  aria-pressed={isActive}
                >
                  <span className={`text-[10px] font-bold ${isActive ? "text-slate-900/70" : "text-slate-400"}`}>
                    {DAY_INITIAL[idx]}
                  </span>
                  <span className={`text-lg font-bold leading-tight ${isActive ? "text-slate-900" : "text-white"}`}>
                    {dayNum}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Szybka nawigacja tygodniem */}
          <div className="flex flex-col items-center gap-1 pb-1">
            <button
              onClick={() => goToWeek(-7)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Poprzedni tydzień"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => goToWeek(7)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Następny tydzień"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </nav>

        {/* Prawa zawartość */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-slate-50">
          <MobileDayView
            day={schedule[selectedDayIndex]}
            dayIndex={selectedDayIndex}
            isCurrentWeek={isCurrentWeek}
            onGoToToday={goToToday}
            weekRangeLabel={`${format(workingDays[0], "d MMM", { locale: pl })} – ${format(workingDays[4], "d MMM", { locale: pl })}`}
            totalPlanned={totalPlanned}
            apiError={apiError}
            onDismissError={() => setApiError(null)}
            onOpenPicker={handleOpenPicker}
            onOpenEditor={handleOpenEditor}
            onRemoveDish={handleRemoveDish}
            onExportPdf={exportPdf}
            onAI={handleAI}
            generating={generating}
            validation={validation}
            loading={loading}
          />
        </main>
      </div>

      {/* Wspólne modale (desktop + mobile) */}
      <DishPickerModal
        open={pickerState.open}
        onOpenChange={(open) => setPickerState(prev => ({ ...prev, open }))}
        mealType={pickerState.mealType}
        dayLabel={pickerState.dayIndex >= 0
          ? format(workingDays[pickerState.dayIndex], 'EEEE, d MMM', { locale: pl })
          : ''}
        onSelectDish={handleSelectDish}
      />

      <MenuItemEditorModal
        open={editorState.open}
        onOpenChange={(open) => setEditorState(prev => ({ ...prev, open }))}
        dish={editingDish}
        onSave={handleSaveEditor}
      />

      <ComplianceDashboardModal
        open={complianceOpen}
        onOpenChange={setComplianceOpen}
        compliance={compliance}
      />
    </div>
  );
}

// ==========================================================================
// MOBILE: widok pojedynczego dnia — inspirowany aplikacja.png (kolorowe karty)
// ==========================================================================
type ValidationResult = ReturnType<typeof validateWeek>;

function MobileDayView(props: {
  day: DaySchedule | undefined;
  dayIndex: number;
  isCurrentWeek: boolean;
  onGoToToday: () => void;
  weekRangeLabel: string;
  totalPlanned: number;
  apiError: string | null;
  onDismissError: () => void;
  onOpenPicker: (mealType: MealType, dayIndex: number) => void;
  onOpenEditor: (dayIndex: number, mealType: MealType) => void;
  onRemoveDish: (dayIndex: number, mealType: MealType) => void;
  onExportPdf: (variant: "sanepid" | "parents") => void;
  onAI: () => void;
  generating: boolean;
  validation: ValidationResult;
  loading: boolean;
}) {
  const {
    day, dayIndex, isCurrentWeek, onGoToToday, weekRangeLabel, totalPlanned,
    apiError, onDismissError, onOpenPicker, onOpenEditor, onRemoveDish,
    onExportPdf, onAI, generating, validation, loading,
  } = props;
  const [actionsOpen, setActionsOpen] = useState(false);

  if (!day) return null;

  const dayName = format(day.date, "EEEE", { locale: pl });
  const dateFull = format(day.date, "d MMMM yyyy", { locale: pl });
  const dateKey = format(day.date, "yyyy-MM-dd");
  const isToday = format(new Date(), "yyyy-MM-dd") === dateKey;
  const dayIssues = validation.dailyIssues[dateKey] || [];
  const plannedToday = Object.keys(day.meals).length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              {weekRangeLabel} {isToday && <span className="text-emerald-600">• Dziś</span>}
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900 mt-0.5 capitalize truncate">
              {dayName}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{dateFull}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={onAI}
              disabled={generating}
              size="sm"
              className="bg-gradient-to-br from-violet-500 to-violet-600 text-white hover:from-violet-600 hover:to-violet-700 shadow-sm"
              aria-label="Generuj plan AI"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              {generating ? "Generowanie…" : "AI"}
            </Button>
          <Drawer open={actionsOpen} onOpenChange={setActionsOpen}>
            <DrawerTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Więcej akcji">
                <Plus className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Akcje tygodnia</DrawerTitle>
                <DrawerDescription className="sr-only">Generuj plan lub eksportuj PDF</DrawerDescription>
              </DrawerHeader>
              <div className="p-4 space-y-2 pb-8">
                <Button
                  onClick={() => { setActionsOpen(false); onExportPdf("parents"); }}
                  variant="outline"
                  className="w-full"
                  disabled={totalPlanned === 0}
                >
                  <Download className="mr-2 h-4 w-4" /> PDF dla rodziców
                </Button>
                <Button
                  onClick={() => { setActionsOpen(false); onExportPdf("sanepid"); }}
                  variant="outline"
                  className="w-full"
                  disabled={totalPlanned === 0}
                >
                  <Download className="mr-2 h-4 w-4" /> PDF Sanepid
                </Button>
                {!isCurrentWeek && (
                  <Button
                    onClick={() => { setActionsOpen(false); onGoToToday(); }}
                    variant="ghost"
                    className="w-full text-emerald-700"
                  >
                    Skocz do bieżącego tygodnia
                  </Button>
                )}
              </div>
            </DrawerContent>
          </Drawer>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs bg-slate-100 rounded-full px-2.5 py-1 font-medium text-slate-600">
            {plannedToday}/{MEAL_ORDER.length} posiłków
          </span>
          {dayIssues.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2.5 py-1 font-medium">
              ⚠ {dayIssues.length} ostrzeżeń
            </span>
          )}
        </div>
      </header>

      {loading && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-md bg-slate-100 text-slate-600 text-xs">
          Ładowanie…
        </div>
      )}
      {apiError && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <span className="truncate">⚠ {apiError}</span>
          <button onClick={onDismissError} aria-label="Zamknij" className="shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Kolorowe karty posiłków */}
      <div className="px-5 pb-6 space-y-3">
        {MEAL_ORDER.map((mealType) => {
          const dish = day.meals[mealType];
          const config = MEAL_CONFIG[mealType];
          const color = MEAL_COLOR[mealType];

          if (!dish) {
            return (
              <button
                key={mealType}
                onClick={() => onOpenPicker(mealType, dayIndex)}
                className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 hover:bg-white hover:border-slate-300 transition-colors p-4 flex items-center gap-3 text-left"
              >
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg">
                  {config.icon}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {config.shortLabel}
                  </p>
                  <p className="text-sm text-slate-400 mt-0.5">Dodaj danie</p>
                </div>
                <Plus className="h-5 w-5 text-slate-400" />
              </button>
            );
          }

          return (
            <div
              key={mealType}
              className={`rounded-2xl shadow-lg shadow-slate-200/50 p-4 ${color.card}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{config.icon}</span>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${color.timeLabel}`}>
                    {config.shortLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onOpenEditor(dayIndex, mealType)}
                    className="h-7 w-7 rounded-lg bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors"
                    aria-label="Edytuj danie"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRemoveDish(dayIndex, mealType)}
                    className="h-7 w-7 rounded-lg bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors"
                    aria-label="Usuń danie"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="mt-2 text-base font-bold leading-snug">{dish.name}</h3>
              <div className="mt-3 flex gap-1.5 flex-wrap">
                {dish.vegFruit && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${color.chip}`}>
                    🥬 Warz./owoc
                  </span>
                )}
                {dish.diet === "meat" && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${color.chip}`}>🥩 Mięso</span>
                )}
                {dish.diet === "vegetarian" && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${color.chip}`}>🥗 Jarskie</span>
                )}
                {dish.diet === "fish" && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${color.chip}`}>🐟 Ryba</span>
                )}
                {dish.diet === "legumes" && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${color.chip}`}>🫘 Strączki</span>
                )}
                {dish.allergens.length > 0 && (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${color.chip}`}>
                    A: {dish.allergens.join(", ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {dayIssues.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <ul className="text-xs text-amber-900 space-y-0.5">
                {dayIssues.map((issue, i) => <li key={i}>• {issue}</li>)}
              </ul>
            </div>
          </div>
        )}

        {plannedToday === MEAL_ORDER.length && dayIssues.length === 0 && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-semibold text-emerald-800">Dzień zaplanowany zgodnie z Sanepid</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================================================
// COMPLIANCE DASHBOARD — STATUS ZGODNOŚCI po generacji AI
// ==========================================================================
const STATUS_STYLE: Record<ComplianceStatus, { dot: string; text: string; bg: string; border: string; label: string }> = {
  ok:    { dot: "bg-emerald-500", text: "text-emerald-800", bg: "bg-emerald-50",  border: "border-emerald-200", label: "OK" },
  warn:  { dot: "bg-amber-500",   text: "text-amber-800",   bg: "bg-amber-50",    border: "border-amber-200",   label: "UWAGA" },
  error: { dot: "bg-rose-500",    text: "text-rose-800",    bg: "bg-rose-50",     border: "border-rose-200",    label: "NARUSZENIE" },
};

function ComplianceDashboardModal({
  open,
  onOpenChange,
  compliance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compliance: ComplianceResponse | null;
}) {
  if (!compliance) return null;

  const errors = compliance.metrics.filter((m) => m.status === "error").length;
  const warns = compliance.metrics.filter((m) => m.status === "warn").length;
  const oks = compliance.metrics.filter((m) => m.status === "ok").length;

  const overallStatus: ComplianceStatus = errors > 0 ? "error" : warns > 0 ? "warn" : "ok";
  const overallStyle = STATUS_STYLE[overallStatus];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            Status zgodności
          </DialogTitle>
          <DialogDescription>
            Analiza wygenerowanego planu względem norm MZ 26.07.2016, Sanepid/HACCP i rekomendacji IŻŻ.
          </DialogDescription>
        </DialogHeader>

        {/* Podsumowanie */}
        <div className={`rounded-xl border p-4 ${overallStyle.bg} ${overallStyle.border}`}>
          <div className="flex items-center gap-3">
            <span className={`inline-block h-3 w-3 rounded-full ${overallStyle.dot}`} />
            <div className="flex-1">
              <p className={`text-sm font-bold ${overallStyle.text}`}>
                {overallStatus === "ok" && "Plan spełnia wszystkie sprawdzane normy"}
                {overallStatus === "warn" && "Plan wymaga drobnych korekt"}
                {overallStatus === "error" && "Wykryto naruszenia norm"}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {oks} OK · {warns} uwag · {errors} naruszeń ·{" "}
                {compliance.historyDays > 0
                  ? `uwzględniono ${compliance.historyDays} dni z dekadówki`
                  : "pierwsza generacja — brak kontekstu historii"}
              </p>
            </div>
          </div>
        </div>

        {/* Metryki */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metryki żywieniowe</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {compliance.metrics.map((m) => {
              const st = STATUS_STYLE[m.status];
              return (
                <div key={m.key} className={`rounded-lg border p-3 ${st.bg} ${st.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${st.dot}`} />
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.label}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${st.text}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-1">{m.value}</p>
                  {m.detail && <p className="text-xs text-slate-500 mt-0.5">{m.detail}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ostrzeżenia serwera (twarde) */}
        {compliance.serverWarnings.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-700">Twarde naruszenia</h3>
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 space-y-1">
              {compliance.serverWarnings.map((w, i) => (
                <div key={i} className="flex gap-2 text-sm text-rose-900 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Uwagi AI (subiektywne) */}
        {compliance.aiWarnings.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Uwagi AI</h3>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
              {compliance.aiWarnings.map((w, i) => (
                <div key={i} className="flex gap-2 text-sm text-amber-900">
                  <span className="shrink-0">•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {compliance.serverWarnings.length === 0 && compliance.aiWarnings.length === 0 && errors === 0 && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-emerald-800">Brak ostrzeżeń — plan gotowy do druku.</p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onOpenChange(false)} variant="outline">Zamknij</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
