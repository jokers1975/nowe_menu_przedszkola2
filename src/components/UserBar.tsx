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

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100">
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
  );
}
