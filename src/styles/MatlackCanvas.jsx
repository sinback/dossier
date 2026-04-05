import { useRef, useCallback } from 'react';
import { renderGlyph, B_ELLIPSE_DATA } from './matlackGlyphs.js';
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
    renderGlyph('c', renderer, canvas.width * 0.15, canvas.height * 0.50, sz, dpr);
    renderGlyph('o', renderer, canvas.width * 0.40, canvas.height * 0.50, sz, dpr);
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
