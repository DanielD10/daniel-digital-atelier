import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** D/D monogram as the favicon, generated at build time. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070605",
          color: "#efeae1",
          fontSize: 17,
          letterSpacing: -1,
        }}
      >
        D/D
      </div>
    ),
    size,
  );
}
