import React, { useRef } from "react";
//import InteractivePaperCanvas, {
//  InteractivePaperHandle,
//} from "./InteractivePaperCanvas";
import InteractivePaperCanvas from "./InteractivePaperCanvas.jsx";

export default function InkyDemo() {
  const paperRef = useRef(null);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#d9d1c2",
        gap: 16,
        padding: 24,
      }}
    >
      <InteractivePaperCanvas
        ref={paperRef}
        width={900}
        height={600}
        bleed={1.15}
        paperRoughness={1.0}
        crumpleStrength={1.1}
        brushRadius={8}
        inkColor={{ r: 30, g: 38, b: 58 }}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => paperRef.current?.reset()}>Reset</button>
        <button
          onClick={() => {
            const png = paperRef.current?.exportPNG();
            if (!png) return;
            const a = document.createElement("a");
            a.href = png;
            a.download = "paper.png";
            a.click();
          }}
        >
          Export PNG
        </button>
      </div>
    </div>
  );
}
