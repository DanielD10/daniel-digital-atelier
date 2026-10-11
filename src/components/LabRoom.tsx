"use client";

import dynamic from "next/dynamic";

/**
 * A client boundary whose only job is to hold the dynamic import.
 *
 * The room is WebGL, a CSS3D layer and a post-processing chain, so
 * it cannot render on the server and should not sit in the first
 * bundle. Next 16 refuses `ssr: false` inside a Server Component,
 * and the Lab page is one because it exports metadata — so the
 * boundary lives here instead.
 */
const AtelierRoom3D = dynamic(() => import("./AtelierRoom3D"), {
  ssr: false,
  loading: () => <div className="room3d-placeholder" />,
});

export default function LabRoom() {
  return <AtelierRoom3D />;
}
