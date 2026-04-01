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
     * Generate a Matlack-style lowercase 'a' using the two-ellipse model.
     *
     * Based on ray-cast analysis of refs 01 and 09:
     *   INNER ellipse (counter/negative space):
     *     - Tilt: ~38° CW from vertical
     *     - Aspect: 0.35 (very elongated)
     *     - Semi-major / letter_h ≈ 0.34
     *     - Semi-minor / letter_h ≈ 0.12
     *
     *   OUTER boundary (ink edge):
     *     - Offset from inner centroid: down-right by ~(1.2, 1.3) px at 1x
     *     - Stroke width varies: thin at top (7-11px@4x), fat at bottom-left (19-26),
     *       huge where downstroke overlaps (30-37)
     *
     * The bowl stroke traces the MIDLINE between inner and outer ellipses.
     * Pressure (= width) at each point is derived from the gap between them.
     */
    function matlackA(cx, cy, size) {
      const dpr = window.devicePixelRatio || 1;
      const s = size * dpr;
      const letterH = s * 0.9;

      // Inner ellipse (counter) — from moment analysis
      const innerTilt = -38 * Math.PI / 180;  // 38° CW from vertical = -38° from vertical
      const innerA = letterH * 0.34;  // semi-major
      const innerB = letterH * 0.12;  // semi-minor

      // Outer ellipse — slightly larger, offset down-right, less tilted
      // This creates the asymmetric stroke width: thin top, fat bottom-left
      const outerOffX = s * 0.04;    // offset right
      const outerOffY = s * 0.05;    // offset down
      const outerTilt = -30 * Math.PI / 180;  // slightly less tilted
      const outerA = innerA * 1.55;  // bigger
      const outerB = innerB * 2.8;   // MUCH wider minor axis → fat bottom-left

      function ellipsePoint(a, b, tilt, angle) {
        const lx = a * Math.cos(angle);
        const ly = b * Math.sin(angle);
        return [
          lx * Math.cos(tilt) - ly * Math.sin(tilt),
          lx * Math.sin(tilt) + ly * Math.cos(tilt),
        ];
      }

      const pts = [];

      // Phase 1: Hairline entry
      const entrySteps = 6;
      const bowlStart = -Math.PI * 0.35;  // ~1 o'clock on the inner ellipse
      const [startIx, startIy] = ellipsePoint(innerA, innerB, innerTilt, bowlStart);
      const [startOx, startOy] = ellipsePoint(outerA, outerB, outerTilt, bowlStart);
      const entryMidX = cx + (startIx + startOx + outerOffX) / 2;
      const entryMidY = cy + (startIy + startOy + outerOffY) / 2;

      for (let i = 0; i <= entrySteps; i++) {
        const t = i / entrySteps;
        pts.push({
          x: entryMidX + (1 - t) * s * 0.08,
          y: entryMidY - (1 - t) * s * 0.04,
          pressure: 0.06 + 0.04 * t,
        });
      }

      // Phase 2: Bowl — trace midline between inner and outer ellipses CCW
      const bowlSteps = 60;
      const bowlEnd = bowlStart - Math.PI * 1.88;  // ~340° sweep
      for (let i = 0; i <= bowlSteps; i++) {
        const t = i / bowlSteps;
        const angle = bowlStart + (bowlEnd - bowlStart) * t;

        const [ix, iy] = ellipsePoint(innerA, innerB, innerTilt, angle);
        const [ox, oy] = ellipsePoint(outerA, outerB, outerTilt, angle);

        // Midline between inner and outer
        const midX = cx + (ix + ox + outerOffX) / 2;
        const midY = cy + (iy + oy + outerOffY) / 2;

        // Stroke width = distance between inner and outer at this angle
        const gap = Math.hypot(
          (ox + outerOffX) - ix,
          (oy + outerOffY) - iy
        );
        // Normalize gap to pressure range
        const maxGap = (outerA + outerB) * 0.6;  // rough max expected gap
        const p = Math.min(0.85, 0.10 + 0.70 * (gap / maxGap));

        pts.push({ x: midX, y: midY, pressure: p });
      }

      // Phase 3: Transition into downstroke
      const transSteps = 8;
      const bowlEndX = pts[pts.length - 1].x;
      const bowlEndY = pts[pts.length - 1].y;
      const downTopX = cx + outerOffX + outerA * 0.55;
      const downTopY = cy - innerA * 0.85;
      for (let i = 1; i <= transSteps; i++) {
        const t = i / transSteps;
        const ease = t * t * (3 - 2 * t);
        pts.push({
          x: bowlEndX + (downTopX - bowlEndX) * ease,
          y: bowlEndY + (downTopY - bowlEndY) * ease,
          pressure: 0.15 + 0.60 * t,
        });
      }

      // Phase 4: Downstroke
      const downSteps = 35;
      const downEndY = cy + innerA * 1.0;
      for (let i = 1; i <= downSteps; i++) {
        const t = i / downSteps;
        const bowX = -s * 0.025 * Math.sin(t * Math.PI);
        let p;
        if (t < 0.6) {
          p = 0.78 + 0.22 * Math.sin(t / 0.6 * Math.PI);
        } else {
          const fade = (t - 0.6) / 0.4;
          p = 0.78 - 0.48 * fade;
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

  // Per-ref ellipse data (4x scale coordinates)
  // inner = counter (negative space) via flood fill + area moments
  // outer = ink outer edge via ray-cast boundary points + boundary moments (√2 corrected)
  //         downstroke angular sector (-20° to 100°) excluded from ray-cast
  const ellipseData = {
    '01': { w: 124, h: 100,
            inner: { cx: 55.0, cy: 41.9, a: 37.7, b: 14.0, tilt: -52.9 },
            outer: { cx: 46.0, cy: 34.0, a: 58.0, b: 23.2, tilt: -42.3 }},
    '02': { w: 104, h: 120,
            inner: { cx: 45.1, cy: 57.0, a: 33.2, b: 10.1, tilt: -51.7 },
            outer: { cx: 35.0, cy: 50.0, a: 54.5, b: 23.1, tilt: -43.9 }},
    '03': null,  // thrown out
    '04': { w: 148, h: 120,
            inner: null,
            outer: { cx: 52.0, cy: 45.0, a: 50.7, b: 20.5, tilt: -41.4 }},
    '05': { w: 144, h: 128,
            inner: { cx: 63.3, cy: 47.8, a: 44.7, b: 17.2, tilt: -50.4 },
            outer: { cx: 51.0, cy: 41.0, a: 65.4, b: 25.1, tilt: -41.0 }},
    '06': { w: 100, h: 120,
            inner: null,
            outer: { cx: 40.0, cy: 62.0, a: 29.2, b: 9.5, tilt: -50.6 }},
    '07': null,  // thrown out
    '08': { w: 156, h: 148,
            inner: null,
            outer: { cx: 57.0, cy: 68.0, a: 32.4, b: 7.7, tilt: -50.6 }},
    '09': { w: 132, h: 104,
            inner: { cx: 57.4, cy: 46.9, a: 30.5, b: 10.5, tilt: -50.3 },
            outer: { cx: 46.0, cy: 41.0, a: 51.6, b: 22.1, tilt: -41.7 }},
    '10': { w: 120, h: 112,
            inner: { cx: 56.0, cy: 62.0, a: 38.4, b: 12.1, tilt: -43.0 },
            outer: { cx: 47.0, cy: 55.0, a: 53.3, b: 20.5, tilt: -40.9 }},
  };

  const REF_H = 80;

  function RefWithEllipse({ idx }) {
    const key = String(idx).padStart(2, '0');
    const src = `/ref/a/${key}.png`;
    const d = ellipseData[key];

    const imgW = d ? d.w : 100;
    const imgH = d ? d.h : 100;
    const scale = REF_H / imgH;
    const dispW = imgW * scale;

    const inner = d?.inner;
    const outer = d?.outer;

    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <div style={{ position: 'relative', width: dispW, height: REF_H }}>
          <img src={src} alt={`ref a ${key}`}
            style={{ width: dispW, height: REF_H, display: 'block',
                     border: '1px solid #ddd', borderRadius: 2 }} />
          <svg style={{ position: 'absolute', top: 0, left: 0, width: dispW, height: REF_H, pointerEvents: 'none' }}>
            {inner && (
              <ellipse
                cx={inner.cx * scale} cy={inner.cy * scale}
                rx={inner.a * scale} ry={inner.b * scale}
                transform={`rotate(${inner.tilt} ${inner.cx * scale} ${inner.cy * scale})`}
                fill="none" stroke="cyan" strokeWidth="1.2" opacity="0.85"
              />
            )}
            {outer && (
              <ellipse
                cx={outer.cx * scale} cy={outer.cy * scale}
                rx={outer.a * scale} ry={outer.b * scale}
                transform={`rotate(${outer.tilt} ${outer.cx * scale} ${outer.cy * scale})`}
                fill="none" stroke="magenta" strokeWidth="1.0" opacity="0.6"
                strokeDasharray="3 2"
              />
            )}
          </svg>
        </div>
        <div style={{ fontSize: 7, color: '#888', textAlign: 'center', lineHeight: '1.1', whiteSpace: 'nowrap' }}>
          {inner ? (
            <>in: {inner.tilt.toFixed(0)}° {(inner.b/inner.a).toFixed(2)}</>
          ) : d ? 'in: —' : 'skip'}
          {outer && (<><br/>out: {outer.tilt.toFixed(0)}° {(outer.b/outer.a).toFixed(2)}</>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Reference strip with ellipse overlays */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1,
        display: 'flex', alignItems: 'flex-start', gap: 4,
        padding: '4px 8px',
        background: 'rgba(245,243,240,0.95)',
        borderBottom: '1px solid #ccc',
        fontFamily: 'monospace', fontSize: 11, color: '#666',
      }}>
        <span style={{ alignSelf: 'center', marginRight: 4 }}>ref:</span>
        {Array.from({ length: 10 }, (_, i) => (
          <RefWithEllipse key={i} idx={i + 1} />
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
