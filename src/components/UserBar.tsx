"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/login/actions";

export function UserBar() {
  const [email, setEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA;
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;

  return (
    <div className="border-t border-slate-100">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Zalogowany</p>
          <p className="text-sm text-slate-700 truncate">{email ?? "…"}</p>
        </div>
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="text-slate-500 hover:text-rose-600"
            aria-label="Wyloguj"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
      {(buildTime || shortSha) && (
        <div className="px-4 pb-2 text-[10px] text-slate-400 font-mono">
          Wersja: {buildTime ?? "dev"}{shortSha ? ` · ${shortSha}` : ""}
        </div>
      )}
    </div>
  );
}
