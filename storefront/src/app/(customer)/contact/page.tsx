import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-stone-800">
      <h1 className="text-2xl font-bold">Contact us</h1>
      <p>
        {BRAND.name} · {BRAND.legalName}
      </p>
      <p>{BRAND.address}</p>
      <p>
        Email: <a className="font-semibold text-green-800 underline" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
      </p>
      <p>Phone: {BRAND.supportPhone}</p>
      <p>Grievance Officer: {BRAND.grievanceOfficer}</p>
    </article>
  );
}
