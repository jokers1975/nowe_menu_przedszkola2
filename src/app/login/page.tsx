import { ChefHat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string; next?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const isSignup = params.mode === "signup";
  const next = params.next ?? "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ChefHat className="h-6 w-6 text-emerald-600" />
          <span className="font-bold text-slate-800">Catering App</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {isSignup ? "Utwórz konto" : "Zaloguj się"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSignup ? "Rejestracja nowego konta." : "Wprowadź email i hasło."}
          </p>
        </div>

        {params.error && (
          <div className="px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            {params.error}
          </div>
        )}
        {params.info === "check-email" && (
          <div className="px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            Sprawdź skrzynkę — wysłaliśmy link weryfikacyjny.
          </div>
        )}

        <form action={isSignup ? signUp : signIn} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <Input type="email" name="email" required autoComplete="email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hasło</label>
            <Input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
            {isSignup ? "Utwórz konto" : "Zaloguj"}
          </Button>
        </form>

        <p className="text-xs text-slate-500 text-center">
          {isSignup ? (
            <>
              Masz już konto?{" "}
              <a href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-emerald-700 hover:underline">
                Zaloguj się
              </a>
            </>
          ) : (
            <>
              Nie masz konta?{" "}
              <a href={`/login?mode=signup${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`} className="text-emerald-700 hover:underline">
                Zarejestruj się
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
