import type { Metadata } from "next";
import Link from "next/link";
import Masthead from "@/components/Masthead";
import ContactForm from "@/components/ContactForm";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Start a project with Daniel Duran — design, engineering and interactive work for brands in San Antonio, Austin and beyond.",
  alternates: { canonical: "/contact" },
};

export default function Contact() {
  return (
    <>
      <Masthead />
      <main className="page" id="main">
        <Link className="back" href="/">
          ← Home
        </Link>

        <h1>
          Let&rsquo;s step
          <br />
          into the future
          <br />
          together.
        </h1>

        <p className="lede">
          Tell me what you&rsquo;re working on. Budget, timeline, or just a rough
          idea — all useful. I read every message myself.
        </p>

        <ContactForm />

        <p className="micro" style={{ marginTop: "56px" }}>
          Or email directly —{" "}
          <a
            href={`mailto:${site.email}`}
            style={{ borderBottom: "1px solid var(--bone-faint)" }}
          >
            {site.email}
          </a>
        </p>
      </main>
    </>
  );
}
