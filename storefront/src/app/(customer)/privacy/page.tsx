import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-stone-800">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-sm text-stone-500">Last updated: {BRAND.updated}. Draft: have it reviewed by a lawyer before launch.</p>
      <p>
        {BRAND.name} ({BRAND.legalName}, {BRAND.address}) respects your privacy and processes personal data in line
        with India&apos;s Digital Personal Data Protection Act, 2023.
      </p>
      <h2 className="text-lg font-bold">What we collect</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Name, phone number and email address, to create your account and contact you about orders.</li>
        <li>Delivery location and order details, to deliver and show your order history.</li>
        <li>Payment status from our payment partner. We never see or store your card or UPI details.</li>
      </ul>
      <h2 className="text-lg font-bold">How we use it</h2>
      <p>
        To process and deliver orders, send OTPs and order updates, prevent fraud and meet legal obligations. We do
        not sell your personal data.
      </p>
      <h2 className="text-lg font-bold">Who sees it</h2>
      <p>
        The restaurant sees only what it needs to prepare your order. A delivery partner sees your delivery details
        for the order they carry. Payment and SMS/email providers process data on our behalf.
      </p>
      <h2 className="text-lg font-bold">Security and retention</h2>
      <p>
        Phone numbers, names and emails are stored encrypted. We keep data only as long as needed for your account,
        order records and legal requirements.
      </p>
      <h2 className="text-lg font-bold">Your rights</h2>
      <p>
        You can ask to access, correct or delete your data, or withdraw consent, by writing to {BRAND.supportEmail}.
        Grievance Officer: {BRAND.grievanceOfficer}.
      </p>
    </article>
  );
}
