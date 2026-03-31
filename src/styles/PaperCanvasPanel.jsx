import { useEffect, useRef } from "react";
import InteractivePaperCanvas from "./InteractivePaperCanvas.jsx";
import { animateText } from "./inkText.js";

// Listens for draw commands from the dev POST API and routes them to the canvas.
// Not interactive — the game (or the API) drives what appears here, not the user.
export default function PaperCanvasPanel({ width = 800, height = 600 }) {
  const canvasRef = useRef(null);
  // Keep a ref to dispatch so the SSE handler always calls the latest version,
  // even after hot-module replacement or parent re-renders.
  const dispatchRef = useRef(null);

  useEffect(() => {
    const es = new EventSource("/api/draw/stream");

    es.onmessage = (e) => {
      let command;
      try {
        command = JSON.parse(e.data);
      } catch {
        console.warn("[PaperCanvasPanel] Received malformed SSE data:", e.data);
        return;
      }
      dispatchRef.current?.(command);
    };

    es.onerror = () => {
      // Silently ignore — endpoint only exists in dev server
    };

    return () => es.close();
  }, []);

  dispatchRef.current = dispatch;
  function dispatch(command) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    switch (command.type) {
      case "rect": {
        const result = canvas.fillRect(command.region, command.color);
        if (!result.ok) console.warn("[PaperCanvasPanel] fillRect:", result.error);
        break;
      }
      case "text": {
        animateText(canvasRef, command);
        break;
      }
      case "clear": {
        canvas.reset();
        break;
      }
      default:
        console.warn("[PaperCanvasPanel] Unknown command type:", command.type);
    }
  }

  return (
    <InteractivePaperCanvas
      ref={canvasRef}
      width={width}
      height={height}
      interactive={false}
      storageKey="dossier-paper-ink"
    />
  );
}
