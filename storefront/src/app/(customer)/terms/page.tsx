import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-stone-800">
      <h1 className="text-2xl font-bold">Terms of service</h1>
      <p className="text-sm text-stone-500">Last updated: {BRAND.updated}. Draft: have it reviewed by a lawyer before launch.</p>
      <p>
        {BRAND.name} is operated by {BRAND.legalName}, {BRAND.address}. By using the site you accept these terms.
      </p>
      <h2 className="text-lg font-bold">Our role</h2>
      <p>
        We are a marketplace connecting you with independent restaurants and delivery partners. Restaurants are
        responsible for their food, its diet labelling (pure veg, vegan, Jain) and their FSSAI licence. {BRAND.fssaiNote}
      </p>
      <h2 className="text-lg font-bold">Orders and prices</h2>
      <p>
        Prices include applicable taxes and are calculated by our servers at checkout. An order is confirmed when
        payment succeeds and the restaurant accepts it.
      </p>
      <h2 className="text-lg font-bold">Your account</h2>
      <p>
        Keep your OTP and password private. You must provide a correct phone number so a delivery partner can reach
        you, and share the delivery OTP only with the person handing over your order.
      </p>
      <h2 className="text-lg font-bold">Allergies and dietary needs</h2>
      <p>
        Tell the restaurant about allergies. Kitchens with a lower certification level may handle non-veg food
        separately; the level is shown on each restaurant.
      </p>
      <h2 className="text-lg font-bold">Contact</h2>
      <p>Questions: {BRAND.supportEmail}.</p>
    </article>
  );
}
