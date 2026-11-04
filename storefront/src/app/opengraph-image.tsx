import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name}: ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1b5e3a 0%, #24764a 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -2 }}>{BRAND.name}</div>
        <div style={{ marginTop: 16, fontSize: 48 }}>{BRAND.tagline}</div>
        <div style={{ marginTop: 40, fontSize: 30, color: "#e8a317" }}>Pure Veg · Vegan · Jain</div>
      </div>
    ),
    size,
  );
}
