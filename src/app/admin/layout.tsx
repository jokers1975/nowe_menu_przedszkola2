import Link from "next/link";
import { ChefHat, FileText, Settings, Users, ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 bg-white border-r border-slate-200 md:flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <ChefHat className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="font-bold text-sm text-slate-800">Panel admina</h1>
              <p className="text-xs text-slate-500">{role === "super_admin" ? "Super Admin" : "Admin"}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
            <ArrowLeft className="mr-3 h-4 w-4" />
            Powrót do planera
          </Link>
          <div className="h-px bg-slate-100 my-2" />
          <Link href="/admin/dishes" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
            <FileText className="mr-3 h-5 w-5" />
            Baza Dań
          </Link>
          <Link href="/admin/users" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
            <Users className="mr-3 h-5 w-5" />
            Użytkownicy
          </Link>
          <Link href="/admin/settings" className={buttonVariants({ variant: "ghost" }) + " w-full justify-start text-slate-600"}>
            <Settings className="mr-3 h-5 w-5" />
            Ustawienia
          </Link>
        </nav>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
