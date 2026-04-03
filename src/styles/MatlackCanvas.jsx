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
    const positions = [0.20, 0.40, 0.60, 0.80];
    renderGlyph('a', renderer, canvas.width * positions[0], canvas.height * 0.50, sz, dpr);
    renderGlyph('b', renderer, canvas.width * positions[1], canvas.height * 0.50, sz, dpr);
    renderGlyph('f', renderer, canvas.width * positions[2], canvas.height * 0.50, sz, dpr);
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

  const bRefs = [
    { src: '/ref/b/01.png', key: '01', ...B_ELLIPSE_DATA['01'], label: 'b 01 ★' },
    { src: '/ref/b/02.png', key: '02', ...B_ELLIPSE_DATA['02'], label: 'b 02' },
    { src: '/ref/ab/01.png', key: 'ab', w: 192/4, h: 176/4, inner: null, outer: null, label: 'ab' },
    { src: '/ref/bo/01.png', key: 'bo', w: 220/4, h: 192/4, inner: null, outer: null, label: 'bo' },
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
        {bRefs.map(r => (
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
