import type { Metadata } from "next";
import NertiaLookbook from "@/components/nertia/NertiaLookbook";
import NertiaNext from "@/components/nertia/NertiaNext";
import NertiaShop from "@/components/nertia/NertiaShop";
import { catalog } from "@/lib/nertia-shop";

export const metadata: Metadata = {
  title: "NERTIA Shop",
  description: "NERTIA Drop 001, the Liquid Series: every piece, finish and product sheet.",
  alternates: { canonical: "/work/nertia/shop" },
};

export default function NertiaShopPage() {
  const units = catalog.reduce((n, p) => n + (p.run ?? 0), 0);
  return (
    <>
      <header className="nxp-head">
        <p className="micro">Shop · Drop 001 · Presale</p>
        <h1>The Liquid Series.</h1>
        <p className="nxp-lede">
          {catalog.length} pieces and {units} numbered units, every one chipped. Open anything to see it in every
          finish, or open a sealed one in AR and see what it holds.
        </p>
      </header>

      <NertiaShop head={false} arHref="/work/nertia/ar" />

      <NertiaLookbook arHref="/work/nertia/ar" />

      <NertiaNext from="/work/nertia/shop" />
    </>
  );
}
