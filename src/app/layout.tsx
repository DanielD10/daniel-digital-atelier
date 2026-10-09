import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Inter } from "next/font/google";
import { site, getSiteUrl } from "@/lib/site";
import "./globals.css";

/**
 * next/font self-hosts these at build time — no render-blocking
 * request to Google, no layout shift, no FOUT. The variable is
 * consumed by --f-display / --f-micro in globals.css.
 */
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: site.title,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.name }],
  creator: site.name,
  keywords: [
    "Daniel Duran",
    "digital designer",
    "creative engineer",
    "web design San Antonio",
    "web design Austin",
    "portfolio",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: "#070605",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodoni.variable} ${inter.variable}`}>
      <head>
        {/*
          Marks the document as JS-capable before first paint, so the
          animated elements can start hidden without a flash of
          content that then jumps.

          The timeout is the failsafe that matters: if GSAP fails to
          load, or throws, the class comes off and everything becomes
          visible anyway. A site that hides its own content when a
          CDN hiccups is worse than a site with no animation.
          Once GSAP has run, it has written inline styles that win
          over these rules, so removing the class is a no-op.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
              var d=document.documentElement;
              d.classList.add('js');
              setTimeout(function(){d.classList.remove('js')},2500);
            }catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
