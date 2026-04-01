import { useRef, useEffect } from 'react';
import { createStrokeRenderer } from './strokeRenderer.js';

/**
 * Full-screen blank WebGL canvas for stroke animation R&D.
 * No paper texture, no Dossier UI — just ink on white.
 *
 * Listens on SSE /api/draw/stream for draw commands (same as PaperCanvasPanel)
 * so snap.sh works with it. Also draws a test stroke on mount for visual verification.
 */
export default function MatlackCanvas() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    if (!gl) {
      console.error('WebGL2 not available');
      return;
    }

    const renderer = createStrokeRenderer(gl);
    rendererRef.current = renderer;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      renderer.clear();
      drawTestStrokes();
    }

    function drawTestStrokes() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width;
      const h = canvas.height;

      // Test stroke 1: horizontal line with varying pressure (shows nib width modulation)
      const horiz = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        horiz.push({
          x: w * 0.1 + t * w * 0.35,
          y: h * 0.3,
          pressure: 0.3 + 0.6 * Math.sin(t * Math.PI),  // swell in the middle
        });
      }
      renderer.drawStroke(horiz, 6 * dpr);

      // Test stroke 2: a circle-ish bowl (like 'o')
      const bowl = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const angle = -Math.PI / 2 + t * Math.PI * 2;
        bowl.push({
          x: w * 0.7 + Math.cos(angle) * 50 * dpr,
          y: h * 0.3 + Math.sin(angle) * 45 * dpr,
          pressure: 0.4 + 0.3 * Math.sin(t * Math.PI * 2 + 1),
        });
      }
      renderer.drawStroke(bowl, 5 * dpr);

      // Test stroke 3: a downstroke (vertical, high pressure — like Matlack's 'a' stem)
      const down = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        down.push({
          x: w * 0.7 + 48 * dpr,  // right side of the bowl
          y: h * 0.3 - 40 * dpr + t * 90 * dpr,
          pressure: 0.5 + 0.4 * Math.sin(t * Math.PI),  // heavy in middle
        });
      }
      renderer.drawStroke(down, 5 * dpr);

      // Test stroke 4: diagonal with light pressure (shows thin hairline)
      const diag = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        diag.push({
          x: w * 0.1 + t * w * 0.2,
          y: h * 0.5 + t * h * 0.15,
          pressure: 0.15 + 0.1 * t,
        });
      }
      renderer.drawStroke(diag, 5 * dpr);
    }

    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'block',
        cursor: 'crosshair',
      }}
    />
  );
}
