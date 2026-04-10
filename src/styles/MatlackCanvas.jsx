import { useRef, useCallback } from 'react';
import { renderGlyph, glyphOuterEllipse, B_ELLIPSE_DATA } from './matlackGlyphs.js';
import MatlackRenderer from './MatlackRenderer.jsx';

/**
 * Full-screen Matlack R&D view with reference strip toolbar.
 * Rendering is delegated to MatlackRenderer.
 */
export default function MatlackCanvas() {
  const matlackRef = useRef(null);

  // Called by MatlackRenderer on mount + every resize — draws the static letter spread.
  const handleDraw = useCallback((renderer, canvas) => {
    renderer.clear();
    renderer.setInkColor(30, 38, 58);
    const dpr = window.devicePixelRatio || 1;
    const sz  = 90;
    const row1 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const row2 = ['j', 'k', 'l', 'm', 'n', 'o', 'q', 't'];
    const letters = [...row1, ...row2];
    const cols = 9;
    const colSpacing = 0.85 / cols;
    const scale = (sz * dpr) / 100;
    const BOWL_PHASE = 0.03;

    // arcFrac tick marks at bowl zone boundaries (see ARC_* constants in matlackGlyphs)
    const ticks = [
      { f: 0.00, color: [255, 0, 0] },     // red    = ARC_ENTRY
      { f: 0.22, color: [0, 200, 0] },      // green  = ARC_LIFT
      { f: 0.55, color: [255, 140, 0] },    // orange = ARC_PRESS
      { f: 0.78, color: [0, 80, 255] },     // blue   = ARC_RISE
    ];

    letters.forEach((l, i) => {
      const row = i < row1.length ? 0 : 1;
      const col = i < row1.length ? i : i - row1.length;
      const cx = canvas.width * (0.05 + col * colSpacing);
      const cy = canvas.height * (0.30 + row * 0.40);
      renderGlyph(l, renderer, cx, cy, sz, dpr);

      // Draw tick marks on the outer ellipse
      const info = glyphOuterEllipse(l);
      if (!info) return;
      const { outer: e, refCenter } = info;
      const eCx = cx + (e.cx - refCenter.x) * scale;
      const eCy = cy + (e.cy - refCenter.y) * scale;
      const eA = e.a * scale;
      const eB = e.b * scale;
      const rad = e.tilt * Math.PI / 180;
      const cosT = Math.cos(rad), sinT = Math.sin(rad);

      for (const { f, color } of ticks) {
        // f = (arcFracRaw + BOWL_PHASE) % 1, so arcFracRaw = (f - BOWL_PHASE + 1) % 1
        const arcFrac = ((f - BOWL_PHASE) + 1) % 1;
        const theta = arcFrac * 2 * Math.PI;
        const lx = eA * Math.cos(theta);
        const ly = eB * Math.sin(theta);
        const px = eCx + lx * cosT - ly * sinT;
        const py = eCy + lx * sinT + ly * cosT;
        // Draw a small dot using a tiny circular bowl (no inner cutout)
        renderer.setInkColor(...color);
        const r = 3 * dpr;
        const dot = { cx: px, cy: py, a: r, b: r, tilt: 0 };
        const pinhole = { cx: px, cy: py, a: 0.1, b: 0.1, tilt: 0 };
        renderer.drawBowl(dot, pinhole, {});
      }
      // Reset ink color
      renderer.setInkColor(30, 38, 58);
    });
  }, []);

  // ── Reference strip ────────────────────────────────────────────────────────
  const REF_H = 80;

  function RefImage({ src, w, h, inner, outer, label }) {
    const scale = REF_H / h;
    const dispW = w * scale;
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <div style={{ position: 'relative', width: dispW, height: REF_H }}>
          <img src={src} alt={label}
            style={{ width: dispW, height: REF_H, display: 'block',
                     border: '1px solid #ddd', borderRadius: 2 }} />
          <svg style={{ position: 'absolute', top: 0, left: 0, width: dispW, height: REF_H, pointerEvents: 'none' }}>
            {inner && (
              <ellipse
                cx={inner.cx * scale} cy={inner.cy * scale}
                rx={inner.a * scale}  ry={inner.b * scale}
                transform={`rotate(${inner.tilt} ${inner.cx * scale} ${inner.cy * scale})`}
                fill="none" stroke="cyan" strokeWidth="1.2" opacity="0.85" />
            )}
            {outer && (
              <ellipse
                cx={outer.cx * scale} cy={outer.cy * scale}
                rx={outer.a * scale}  ry={outer.b * scale}
                transform={`rotate(${outer.tilt} ${outer.cx * scale} ${outer.cy * scale})`}
                fill="none" stroke="magenta" strokeWidth="1.0" opacity="0.6"
                strokeDasharray="3 2" />
            )}
          </svg>
        </div>
        <div style={{ fontSize: 7, color: '#888', textAlign: 'center', lineHeight: '1.1' }}>{label}</div>
      </div>
    );
  }

  // Automated ellipse fits from crescent model (scipy Nelder-Mead, 1x coords)
  const C_FIT = {
    '01': { w: 67, h: 67,
            inner: { cx: 39.7, cy: 27.5, a: 14.5, b: 7.1, tilt: -41.6 },
            outer: { cx: 32.2, cy: 28.4, a: 34.5, b: 9.0, tilt: -44.1 }},
    '02': { w: 68, h: 78, inner: null, outer: null },
  };
  const O_FIT = {
    '03': { w: 75, h: 66,
            inner: { cx: 40.3, cy: 33.5, a: 20.8, b: 10.8, tilt: -45.5 },
            outer: { cx: 38.2, cy: 33.1, a: 38.8, b: 15.3, tilt: -45.5 }},
  };

  const refs = [
    { src: '/ref/c/01.png', key: 'c01', ...C_FIT['01'], label: 'c 01 (auto)' },
    { src: '/ref/c/02.png', key: 'c02', ...C_FIT['02'], label: 'c 02' },
    { src: '/ref/o/03.png', key: 'o03', ...O_FIT['03'], label: 'o 03 (auto)' },
    { src: '/ref/o/02.png', key: 'o02', w: 79, h: 74, inner: null, outer: null, label: 'o 02' },
    { src: '/ref/b/01.png', key: 'b01', ...B_ELLIPSE_DATA['01'], label: 'b 01 ★' },
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px',
        background: 'rgba(245,243,240,0.95)',
        borderBottom: '1px solid #ccc',
        fontFamily: 'monospace', fontSize: 11, color: '#666',
      }}>
        <span style={{ marginRight: 4 }}>ref:</span>
        {refs.map(r => (
          <RefImage key={r.key} src={r.src} w={r.w} h={r.h}
            inner={r.inner} outer={r.outer} label={r.label} />
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => matlackRef.current?.clear()}
            style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
            clear
          </button>
        </div>
      </div>

      {/* Canvas */}
      <MatlackRenderer
        ref={matlackRef}
        onDraw={handleDraw}
        style={{ position: 'fixed', top: 0, left: 0, cursor: 'crosshair' }}
      />
    </div>
  );
}
