"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";

interface MeResponse {
  configured: boolean;
  signed_in: boolean;
  email: string | null;
  name: string | null;
}

export function SignInChip({ redirect = "/settings" }: { redirect?: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMe(j))
      .catch(() => setMe({ configured: false, signed_in: false, email: null, name: null }));
  }, []);

  if (!me) {
    return null;
  }
  if (!me.configured) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs text-muted-foreground"
        title="OAuth not yet configured. Set SESSION_SECRET + add the /api/auth/callback URI in Google Cloud Console."
      >
        <ShieldCheck className="h-3 w-3" /> sign-in: not configured
      </span>
    );
  }
  if (!me.signed_in) {
    return (
      <a
        href={`/api/auth/google?redirect=${encodeURIComponent(redirect)}`}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-muted"
      >
        <LogIn className="h-3.5 w-3.5" /> Sign in with Google
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-md border bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      <ShieldCheck className="h-3.5 w-3.5" />
      <span className="truncate">{me.email}</span>
      <a
        href={`/api/auth/logout?redirect=${encodeURIComponent(redirect)}`}
        className="inline-flex items-center gap-1 text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
        title="Sign out"
      >
        <LogOut className="h-3 w-3" /> out
      </a>
    </span>
  );
}
