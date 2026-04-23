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
git clone https://github.com/jokers1975/nowe_menu_przedszkola2.git
cd nowe_menu_przedszkola2
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

### 4. GitHub Actions — build image do GHCR

Obrazy buduje GitHub Actions i publikuje do GHCR (`ghcr.io/jokers1975/nowe_menu_przedszkola2`).
Klucze `NEXT_PUBLIC_*` muszą być dostępne w build time (Next.js wpieka je do client bundle), więc dodaj je jako **Repository variables** (nie secrets — to publiczne wartości Supabase):

1. GitHub → repo → **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://XXXX.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJ...` (anon public key — OK w repo publicznym)
2. Przy pierwszym pushu do `main` workflow `Build & push` buduje i taguje `:latest` + `:sha-abc123` + `:YYYYMMDD-HHmm`
3. Pakiet pojawi się w zakładce **Packages** repo. Ustaw **Package visibility → Public**, żeby Dockge nie potrzebował logowania do GHCR

### 5. Dockge — utwórz stack

1. W Dockge: **Compose → New Stack**
2. **Name**: `menu-catering`
3. **Compose**: wklej zawartość [`compose.yaml`](./compose.yaml) — używa `image: ghcr.io/...:latest`, więc Dockge tylko pullje gotowy obraz (szybko)
4. **Environment** (`.env` w Dockge):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   DATABASE_URL=postgresql://postgres.XXXX:HASLO@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   OPENROUTER_API_KEY=sk-or-v1-...   # opcjonalnie
   SUPER_ADMIN_EMAIL=ty@twoja-domena.pl
   ```
5. **Deploy** — Dockge pullje `:latest` z GHCR (~30 s) i startuje kontener
6. Otwórz `http://truenas.local:3000`

### 6. Pierwsze logowanie

1. Wejdź na `/login`, zarejestruj konto z mailem równym `SUPER_ADMIN_EMAIL`
2. Po pierwszym logowaniu dostaniesz automatycznie rolę `super_admin`
3. Jeśli nie podałeś `OPENROUTER_API_KEY` w env, wpisz klucz w `/admin/settings`
4. Dodaj logo restauracji w `/admin/profile` (pojawi się tylko na wydruku dla rodziców)

---

## Aktualizacje

Każdy push do `main` uruchamia workflow `Build & push`, który buduje nowy obraz i taguje go jako `:latest` + `:sha-<commit>` + `:<data>`.

W Dockge:
- **Update → Deploy** — pullje najnowszy `:latest` i restartuje kontener (~30 s, bez rebuildu na serwerze)
- Status builda widać na https://github.com/jokers1975/nowe_menu_przedszkola2/actions

### Powiadomienia o nowej wersji (opcjonalnie)

Dodaj **Diun** jako osobny stack w Dockge — lekki watcher, który wysyła notyfikację (Discord/Telegram/email/ntfy) gdy pojawi się nowy tag w rejestrze:

```yaml
# diun/compose.yaml
services:
  diun:
    image: crazymax/diun:latest
    container_name: diun
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
    environment:
      TZ: Europe/Warsaw
      LOG_LEVEL: info
      DIUN_WATCH_WORKERS: 5
      DIUN_WATCH_SCHEDULE: "0 */30 * * * *"     # co 30 min
      DIUN_PROVIDERS_DOCKER: true
      DIUN_PROVIDERS_DOCKER_WATCHBYDEFAULT: true
      # wybierz jeden notyfikator:
      DIUN_NOTIF_NTFY_ENDPOINT: https://ntfy.sh
      DIUN_NOTIF_NTFY_TOPIC: twoj-unikalny-topic
```

Diun obserwuje wszystkie kontenery na tym samym Dockerze i informuje o nowych tagach.

Dla **auto-update bez klikania** zamień Diuna na **Watchtower** (ale wtedy produkcja rebuild'uje się sama — używaj świadomie):

```yaml
# watchtower/compose.yaml
services:
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      WATCHTOWER_POLL_INTERVAL: 900    # 15 min
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_LABEL_ENABLE: "true"
```

Wtedy dodaj label do serwisu `app` w `compose.yaml` catering: `com.centurylinklabs.watchtower.enable=true`.

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
