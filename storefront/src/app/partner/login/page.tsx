"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OtpLogin, safePartnerNext, useAuth } from "@/features/auth";

function nextUrl(): string {
  if (typeof window === "undefined") return "/partner";
  return safePartnerNext(new URLSearchParams(window.location.search).get("next"));
}

export default function PartnerLoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authed") {
      router.replace(nextUrl());
    }
  }, [status, router]);

  const finish = () => {
    router.replace(nextUrl());
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center space-y-5 px-4 py-10">
      <div className="text-center">
        <span className="inline-block rounded-md border border-green-800/20 bg-haldi px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-green-900">
          Delivery Partner Portal
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">Veggo Eats Fleet</h1>
        <p className="mt-1 text-sm text-stone-600">
          Sign in with your verified mobile number to go online, accept delivery assignments, and complete handoffs.
        </p>
      </div>

      <div className="card p-5">
        <OtpLogin askName submitLabel="Sign in to Delivery Portal" onDone={finish} />
      </div>

      <p className="text-center text-sm text-stone-600">
        Looking to order food?{" "}
        <Link href="/" className="font-semibold text-green-800 underline">
          Go to Customer Storefront
        </Link>
      </p>
    </main>
  );
}
