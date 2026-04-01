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

    /**
     * Generate a Matlack-style lowercase 'a'.
     * Based on analysis of 10 reference samples from the 1823 Stone facsimile.
     *
     * Construction (single stroke, no pen lift):
     * 1. Hairline entry from upper-right, moving left
     * 2. Lightweight crescent bowl sweeps CCW: left, down, around bottom, back up right
     * 3. Without lifting, transitions into heavy downstroke on right side
     * 4. Slight leftward curve at bottom, optional exit flick
     *
     * Key insight: the downstroke is the dominant stroke (heavy, slow).
     * The bowl is secondary (light, fast). This is reversed from typical
     * modern manuscript 'a' instruction.
     */
    /**
     * Generate a Matlack-style lowercase 'a'.
     * Based on analysis of 10 reference samples from the 1823 Stone facsimile.
     *
     * Construction (single stroke, no pen lift):
     * 1. Hairline entry from upper-right, moving left
     * 2. Very thin crescent bowl sweeps CCW — almost a hairline throughout
     * 3. Without lifting, transitions into heavy downstroke starting at top of letter
     * 4. Slight leftward curve at bottom, exit flick
     *
     * Key proportions from reference:
     * - Bowl aspect ratio ~0.6:1 (taller than wide)
     * - Downstroke runs full letter height on the right
     * - Bowl is a hairline; downstroke has 5-8x the visual weight
     */
    function matlackA(cx, cy, size) {
      const dpr = window.devicePixelRatio || 1;
      const s = size * dpr;
      const rx = s * 0.28;      // bowl horizontal radius — narrow
      const ry = s * 0.42;      // bowl vertical radius — taller than wide

      const pts = [];

      // Phase 1: Hairline entry from upper-right
      const entrySteps = 6;
      for (let i = 0; i <= entrySteps; i++) {
        const t = i / entrySteps;
        pts.push({
          x: cx + rx * 0.6 - t * rx * 0.25,
          y: cy - ry * 0.9 + t * ry * 0.1,
          pressure: 0.06 + 0.02 * t,
        });
      }

      // Phase 2: Bowl — light crescent, CCW, ~340° sweep (nearly closes)
      // Wider at top (more lateral spread), fatter at bottom-left.
      // The bowl is an egg shape: wider at the top, narrowing toward the bottom.
      const bowlSteps = 55;
      const bowlStart = -Math.PI * 0.4;    // start at ~1 o'clock
      const bowlEnd = bowlStart - Math.PI * 1.9;  // almost full circle CCW
      for (let i = 0; i <= bowlSteps; i++) {
        const t = i / bowlSteps;
        const angle = bowlStart + (bowlEnd - bowlStart) * t;
        // Egg shape: horizontal radius wider at top, narrower at bottom
        const vertFrac = (-Math.sin(angle) + 1) / 2;  // 1 at top, 0 at bottom
        const localRx = rx * (0.85 + 0.3 * vertFrac);  // wider at top

        // Pressure: visible throughout, fatter at bottom-left quadrant
        // bottom-left = angle around π (180°)
        const bottomLeft = Math.exp(-2 * ((angle - Math.PI) * (angle - Math.PI)));
        const bottomness = (Math.sin(angle) + 1) / 2;
        pts.push({
          x: cx + Math.cos(angle) * localRx,
          y: cy + Math.sin(angle) * ry,
          pressure: 0.15 + 0.10 * bottomness + 0.10 * bottomLeft,
        });
      }

      // Phase 3: Smooth transition into downstroke
      // The bowl returns to upper-right and the pen seamlessly becomes the
      // downstroke — in Matlack's hand, the downstroke IS the right edge of
      // the bowl. They share the same x-position.
      const transSteps = 8;
      const bowlEndX = pts[pts.length - 1].x;
      const bowlEndY = pts[pts.length - 1].y;
      // Downstroke starts at the top of the letter, aligned with bowl right edge
      const downTopX = cx + rx;
      const downTopY = cy - ry * 0.92;
      for (let i = 1; i <= transSteps; i++) {
        const t = i / transSteps;
        // Cubic ease for smooth direction change
        const ease = t * t * (3 - 2 * t);
        pts.push({
          x: bowlEndX + (downTopX - bowlEndX) * ease,
          y: bowlEndY + (downTopY - bowlEndY) * ease,
          pressure: 0.12 + 0.55 * t,  // ramp up to heavy
        });
      }

      // Phase 4: Downstroke — dominant, heavy, full letter height
      const downSteps = 35;
      const downEndY = cy + ry * 1.05;
      for (let i = 1; i <= downSteps; i++) {
        const t = i / downSteps;
        // Slight leftward bow
        const bowX = -s * 0.03 * Math.sin(t * Math.PI);
        // Pressure: very heavy, peaks in upper half, tapers at exit
        let p;
        if (t < 0.6) {
          p = 0.75 + 0.25 * Math.sin(t / 0.6 * Math.PI);
        } else {
          const fade = (t - 0.6) / 0.4;
          p = 0.75 - 0.45 * fade;
        }
        pts.push({
          x: downTopX + bowX,
          y: downTopY + (downEndY - downTopY) * t,
          pressure: p,
        });
      }

      // Phase 5: Exit flick
      const flickSteps = 6;
      const flickStartX = pts[pts.length - 1].x;
      const flickStartY = pts[pts.length - 1].y;
      for (let i = 1; i <= flickSteps; i++) {
        const t = i / flickSteps;
        pts.push({
          x: flickStartX + t * s * 0.06,
          y: flickStartY + t * s * 0.015,
          pressure: 0.25 * (1 - t * t),
        });
      }

      return pts;
    }

    function drawTestStrokes() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width;
      const h = canvas.height;
      const radius = 4.5 * dpr;

      // Draw several instances of Matlack's 'a' at different sizes
      // Large, centered
      const a1 = matlackA(w * 0.3, h * 0.35, 120);
      renderer.drawStroke(a1, radius);

      // Medium
      const a2 = matlackA(w * 0.6, h * 0.35, 80);
      renderer.drawStroke(a2, radius * 0.7);

      // Small
      const a3 = matlackA(w * 0.8, h * 0.35, 50);
      renderer.drawStroke(a3, radius * 0.45);

      // Another large with slight position variation (test consistency)
      const a4 = matlackA(w * 0.3, h * 0.7, 120);
      renderer.drawStroke(a4, radius);
    }

    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  const refs = Array.from({ length: 10 }, (_, i) =>
    `/ref/a/${String(i + 1).padStart(2, '0')}.png`
  );

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Reference strip */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        background: 'rgba(245,243,240,0.95)',
        borderBottom: '1px solid #ccc',
        fontFamily: 'monospace', fontSize: 11, color: '#666',
      }}>
        <span>ref:</span>
        {refs.map((src, i) => (
          <img key={i} src={src} alt={`ref a ${i + 1}`}
            style={{ height: 56, border: '1px solid #ddd', borderRadius: 2 }} />
        ))}
      </div>
      {/* Canvas */}
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
    </div>
  );
}
