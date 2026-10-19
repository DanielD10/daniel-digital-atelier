/**
 * Where LUXE lives. It's its own site (DanielD10/luxe). Set
 * NEXT_PUBLIC_LUXE_URL once it has a custom domain; until then this
 * points at its Vercel address.
 */
export const LUXE_URL = (process.env.NEXT_PUBLIC_LUXE_URL || "https://luxe-danield10.vercel.app").replace(/\/$/, "");
