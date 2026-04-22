// EU 1169/2011 — 14 alergenów obowiązkowych do oznaczania
export const EU_ALLERGENS: readonly { number: number; name: string }[] = [
  { number: 1, name: "Zboża zawierające gluten" },
  { number: 2, name: "Skorupiaki" },
  { number: 3, name: "Jaja" },
  { number: 4, name: "Ryby" },
  { number: 5, name: "Orzeszki ziemne" },
  { number: 6, name: "Soja" },
  { number: 7, name: "Mleko" },
  { number: 8, name: "Orzechy" },
  { number: 9, name: "Seler" },
  { number: 10, name: "Gorczyca" },
  { number: 11, name: "Sezam" },
  { number: 12, name: "Dwutlenek siarki i siarczyny" },
  { number: 13, name: "Łubin" },
  { number: 14, name: "Mięczaki" },
] as const;

export function allergenLabel(n: number): string {
  return EU_ALLERGENS.find((a) => a.number === n)?.name ?? `#${n}`;
}
