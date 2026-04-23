// Generuje SQL INSERTy dla global_dish_ingredients z CSV
// i dokleja do scripts/seed-dishes.sql.
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const csvPath = path.resolve("download/database_export/global_dish_ingredients.csv");
const globalDishesCsv = path.resolve("download/database_export/global_dishes.csv");
const outPath = path.resolve("scripts/seed-dishes.sql");

const dishRows = parse(fs.readFileSync(globalDishesCsv, "utf8"), { columns: true, skip_empty_lines: true });
const knownDishIds = new Set(dishRows.map((r) => r.id));

const rows = parse(fs.readFileSync(csvPath, "utf8"), { columns: true, skip_empty_lines: true });

const esc = (s) => String(s ?? "").replace(/'/g, "''");
const intOrNull = (v) => (v === "" || v == null ? "NULL" : parseInt(v, 10));

let skipped = 0;
const lines = [];
lines.push("");
lines.push("-- Skladniki globalnych dan (z dump-u CSV)");
lines.push("BEGIN;");
for (const r of rows) {
  if (!knownDishIds.has(r.global_dish_id)) { skipped++; continue; }
  const id = r.id;
  const dishId = r.global_dish_id;
  const name = esc(r.ingredient_name);
  const qty = intOrNull(r.quantity);
  const unit = esc(r.unit || "g");
  const pos = intOrNull(r.position_order);
  lines.push(
    `INSERT INTO global_dish_ingredients (id, global_dish_id, ingredient_name, quantity, unit, position_order) ` +
    `VALUES ('${id}'::uuid, '${dishId}'::uuid, '${name}', ${qty}, '${unit}', ${pos}) ON CONFLICT (id) DO NOTHING;`,
  );
}
lines.push("COMMIT;");
lines.push("");

fs.appendFileSync(outPath, lines.join("\n"));
console.log(`Appended ${rows.length - skipped} ingredient INSERTs to ${outPath} (skipped ${skipped} orphans)`);
