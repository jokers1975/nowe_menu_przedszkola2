"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldCheck, User as UserIcon, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type UserRow = {
  id: string;
  email: string | null;
  createdAt: string;
  role: "super_admin" | "admin" | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<"super_admin" | "admin" | null>(null);

  const load = async () => {
    try {
      const [usersRes, meRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/me/role"),
      ]);
      const usersData = await usersRes.json();
      const meData = await meRes.json();
      if (!usersRes.ok) {
        setStatus({ kind: "err", msg: usersData.error ?? "Błąd" });
      } else {
        setUsers(usersData.users);
      }
      if (meRes.ok) {
        setCurrentUserId(meData.userId ?? null);
        setCurrentRole(meData.role ?? null);
      }
    } catch (e) {
      setStatus({ kind: "err", msg: String(e) });
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const toggle = async (u: UserRow) => {
    if (u.role === "super_admin") return;
    const grant = u.role !== "admin";
    setBusyId(u.id);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, grant }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "err", msg: data.error ?? "Błąd" });
      } else {
        setStatus({
          kind: "ok",
          msg: grant ? "Nadano uprawnienia admina." : "Odebrano uprawnienia admina.",
        });
        await load();
      }
    } catch (e) {
      setStatus({ kind: "err", msg: String(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Użytkownicy</h1>
          <p className="text-slate-500 text-sm mt-1">
            Zarządzanie kontami i uprawnieniami administracyjnymi.
            {currentRole !== "super_admin" && (
              <span className="block text-amber-700 mt-1">
                Zmiany ról są dostępne tylko dla Super Admina.
              </span>
            )}
          </p>
        </div>

        {status && (
          <div
            className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
              status.kind === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}
          >
            {status.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {status.msg}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 text-sm">Ładowanie…</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Rola</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Utworzono</th>
                  <th className="text-right px-4 py-3 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const isSuper = u.role === "super_admin";
                  const isAdmin = u.role === "admin";
                  const canModify = currentRole === "super_admin" && !isSuper;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-800">{u.email ?? <em className="text-slate-400">(brak emaila)</em>}</span>
                          {isSelf && <span className="text-xs text-slate-400">(ja)</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isSuper && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            <ShieldCheck className="h-3 w-3" /> Super Admin
                          </span>
                        )}
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                            <Shield className="h-3 w-3" /> Admin
                          </span>
                        )}
                        {!u.role && <span className="text-xs text-slate-400">Użytkownik</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                        {new Date(u.createdAt).toLocaleDateString("pl-PL")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSuper ? (
                          <span className="text-xs text-slate-400">chronione</span>
                        ) : canModify ? (
                          <Button
                            variant={isAdmin ? "outline" : "secondary"}
                            size="sm"
                            disabled={busyId === u.id}
                            onClick={() => toggle(u)}
                            className={isAdmin ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}
                          >
                            {busyId === u.id ? "…" : isAdmin ? "Odbierz admina" : "Nadaj admina"}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">
                      Brak użytkowników.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
