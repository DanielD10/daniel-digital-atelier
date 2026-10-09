import { ImageResponse } from "next/og";

/**
 * Generated at build time. This is what shows when the link is
 * pasted into iMessage, Slack, LinkedIn or X — worth getting right,
 * because for a lot of people it's the first impression.
 */

export const alt = "Daniel Duran — Digital Designer & Creative Engineer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#070605",
          padding: "80px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "560px",
            height: "630px",
            background:
              "radial-gradient(circle at 60% 40%, rgba(182,135,63,0.30), rgba(7,6,5,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            fontSize: 26,
            letterSpacing: 10,
            color: "#a39b8e",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Digital Atelier
        </div>
        <div
          style={{
            fontSize: 124,
            lineHeight: 1,
            color: "#f6f2ea",
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>DANIEL</span>
          <span>DURAN</span>
        </div>
        <div
          style={{
            fontSize: 28,
            letterSpacing: 7,
            color: "#d6d0c6",
            marginTop: 36,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Digital Artist / Designer / Engineer
        </div>
      </div>
    ),
    size,
  );
}
