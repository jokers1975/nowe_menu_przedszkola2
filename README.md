# Menu Catering

Planer jadłospisów cateringowych dla przedszkoli — zgodny z wymaganiami Sanepidu (EU 1169/2011, MZ 26.07.2016, IŻŻ/GIS).
Next.js 16 + Supabase Cloud (auth + Postgres) + Drizzle ORM + OpenRouter (AI).

---

## Funkcje

- Planer tygodniowy (śniadanie / II śniadanie / obiad / podwieczorek)
- Baza dań z 14 alergenami EU 1169 i dietami (wegańska, wegetariańska, bezglutenowa, bezmleczna, bez jajek)
- Generator jadłospisów przez AI (OpenRouter) — z regułami Sanepidu i EU
- Dashboard zgodności (metryki warzywa/owoce, nabiał, ryby, różnorodność)
- PDF-y: **Sanepid** (A4, gęsty) oraz **Parents** (kolorowy, landscape, z ikonami alergenów)
- Logo restauracji na wydrukach dla rodziców
- Role: `super_admin` (pierwszy user z `SUPER_ADMIN_EMAIL` dostaje rolę przy logowaniu)

---

## Instalacja na TrueNAS (Dockge)

### 1. Supabase Cloud (darmowy plan wystarczy)

1. Załóż projekt na https://supabase.com/dashboard
2. Zapisz hasło do bazy (Database Password) — podawane przy tworzeniu projektu
3. Skopiuj dane z **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (secret!) → `SUPABASE_SERVICE_ROLE_KEY`
4. Skopiuj connection string z **Project Settings → Database → Connection string → Transaction pooler**:
   - Format: `postgresql://postgres.XXXXX:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
   - → `DATABASE_URL`

### 2. Migracja schematu bazy

Z lokalnego komputera (jednorazowo, zanim zrobisz deploy):

```bash
git clone https://github.com/jokers1975/najlepszycatering.git
cd najlepszycatering
npm install
cp .env.example .env
# uzupełnij .env (szczególnie DATABASE_URL)
npm run db:push
```

Alternatywnie wgraj pliki SQL z `supabase/migrations/` przez **SQL Editor** w Supabase dashboard.

### 3. (Opcjonalnie) Zaimportuj dania z CSV

```bash
npm run seed
```

Potrzebny plik `download/database_export.zip` z CSV-ami (`allergens.csv`, `dishes.csv`, `dish_allergens.csv`, `global_dishes.csv`, `global_dish_allergens.csv`). Skrypt jest idempotentny.

### 4. Dockge — utwórz stack

1. W Dockge: **Compose → New Stack**
2. **Name**: `menu-catering`
3. **Compose**: wklej zawartość [`compose.yaml`](./compose.yaml) z repo (Dockge sam sklonuje GitHub i zbuduje image)
4. **Environment** (`.env` w Dockge):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   DATABASE_URL=postgresql://postgres.XXXX:HASLO@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   OPENROUTER_API_KEY=sk-or-v1-...   # opcjonalnie
   SUPER_ADMIN_EMAIL=ty@twoja-domena.pl
   ```
5. **Deploy** — Dockge zbuduje image z GitHuba (3–5 min przy pierwszym buildzie)
6. Otwórz `http://truenas.local:3000`

### 5. Pierwsze logowanie

1. Wejdź na `/login`, zarejestruj konto z mailem równym `SUPER_ADMIN_EMAIL`
2. Po pierwszym logowaniu dostaniesz automatycznie rolę `super_admin`
3. Jeśli nie podałeś `OPENROUTER_API_KEY` w env, wpisz klucz w `/admin/settings`
4. Dodaj logo restauracji w `/admin/profile` (pojawi się tylko na wydruku dla rodziców)

---

## Aktualizacje

W Dockge: **Edit stack → Update → Deploy**. Dockge zaciągnie najnowszy commit z `main` i przebuduje obraz.

---

## Rozwój lokalny

```bash
npm install
cp .env.example .env
# uzupełnij .env
npm run dev
```

Aplikacja startuje na `http://localhost:3000`.

### Skrypty

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run start` — production server (po buildzie)
- `npm run db:push` — synchronizuje schemat Drizzle z bazą
- `npm run db:studio` — Drizzle Studio (GUI do bazy)
- `npm run seed` — import danych z `download/database_export.zip`

---

## Stack

- **Next.js 16** (App Router, `output: standalone`)
- **React 19** + Tailwind CSS 4 + shadcn/ui
- **Supabase** — auth (SSR cookies), Postgres (pooler)
- **Drizzle ORM** — schemat i migracje
- **Vercel AI SDK** + **OpenRouter** — generowanie jadłospisów
- **Docker** multi-stage build (~150 MB finalny obraz)

---

## Licencja

Prywatny projekt.
