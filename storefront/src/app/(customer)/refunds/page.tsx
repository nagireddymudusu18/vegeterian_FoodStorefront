import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Cancellation and refunds" };

export default function RefundsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-stone-800">
      <h1 className="text-2xl font-bold">Cancellation and refund policy</h1>
      <p className="text-sm text-stone-500">Last updated: {BRAND.updated}. Draft: confirm the rules match the live flow before launch.</p>
      <h2 className="text-lg font-bold">Cancelling</h2>
      <p>
        You can cancel an order from its page until a delivery partner has been assigned. After that the food is
        ready and on its way, and the order can no longer be cancelled.
      </p>
      <h2 className="text-lg font-bold">Refunds</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>If the restaurant rejects or cannot fulfil your paid order, you get a full refund.</li>
        <li>If you cancel a paid order within the window above, you get a full refund.</li>
        <li>If an order is wrong, missing items or not delivered, write to us with your order number.</li>
      </ul>
      <p>
        Refunds go back to the original payment method and usually take 5-7 working days to show in your account.
      </p>
      <h2 className="text-lg font-bold">Contact</h2>
      <p>
        {BRAND.supportEmail}
        {BRAND.supportPhone.startsWith("[") ? "" : `, ${BRAND.supportPhone}`}
      </p>
    </article>
  );
}
