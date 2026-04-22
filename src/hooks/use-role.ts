"use client";

import { useEffect, useState } from "react";

export type Role = "super_admin" | "admin" | null;

export function useRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/role")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRole(data.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = role === "admin" || role === "super_admin";
  return { role, isAdmin, loading };
}
