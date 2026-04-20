import { useRef, useCallback, useState, useEffect } from 'react';
import { sampleSegments, buildRibbon } from './matlackGlyphs.js';
import { exportAlphabetSVG, exportGlyphsForFont } from './matlackSVGExport.js';
import MatlackRenderer from './MatlackRenderer.jsx';
import toRefImage from '../../matlack-declaration/reference/context/to/01.png';

/**
 * Full-screen Matlack R&D view with reference strip toolbar.
 * Rendering is delegated to MatlackRenderer.
 */
export default function MatlackCanvas() {
  const matlackRef = useRef(null);

  // Window size (for positioning the overlay image in CSS pixels).
  const [winSize, setWinSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth  : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Overlay image transform: must mirror the svg→canvas math below
  // (but in CSS pixels, i.e., without the dpr multiplier).
  const cssScale = Math.min(winSize.w / 140, winSize.h / 120);
  const overlay = {
    left:   winSize.w / 2 - 58 * cssScale,   // svg x=0
    top:    winSize.h / 2 - 55 * cssScale,   // svg y=0
    width:  116 * cssScale,
    height:  89 * cssScale,
  };

  // Review: annotated reference of Matlack's "to" svg (matlack-declaration/
  // reference/context/to/01_paths), focusing on path3 "t Exit → o Entry".
  // Shows rule.y-bottom (baseline) and rule.y-center lines, the full path3
  // curve (dark ink), dots at its endpoints (blue), and the gestalt midpoint
  // — the junction between Matlack's two authored Bezier segments (red).
  const handleDraw = useCallback((renderer, canvas) => {
    renderer.clear();
    const dpr = window.devicePixelRatio || 1;

    // svg viewBox is 0..116 × 0..89. Center the view on (58, 55).
    const REF = { x: 58, y: 55 };
    const scale = Math.min(canvas.width / 140, canvas.height / 120) * dpr;
    const cx0 = canvas.width / 2;
    const cy0 = canvas.height / 2;
    const toCanvas = (sx, sy) => ({
      x: cx0 + (sx - REF.x) * scale,
      y: cy0 + (sy - REF.y) * scale,
    });

    // Rule lines are drawn as HTML overlays (below) so they stay crisp
    // on top of the reference image.

    // ── path3: t Exit Flick → o Entry (ink) ───────────────────────────
    renderer.setInkColor(30, 38, 58);
    const path3Segs = [
      [[25.86, 75.95], [25.59, 76.19], [32.97, 76.01], [33.66, 75.39]],
      [[33.66, 75.39], [36.06, 76.97], [60.13, 55.20], [60.03, 55.13]],
    ];
    const path3Center = sampleSegments(path3Segs, [0, 1], 16,
      cx0, cy0, scale, REF);
    const path3Quads = buildRibbon(path3Center, () => 0.9 * scale);
    renderer.drawFills(
      path3Quads.map(q => ({ points: q, pressure: 0.85 }))
    );

    // Dot helper — small filled circle at (sx, sy) in svg coords.
    const dot = (sx, sy, radius = 1.5) => {
      const n = 16;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        pts.push(toCanvas(sx + radius * Math.cos(a), sy + radius * Math.sin(a)));
      }
      return { points: pts, pressure: 0.95 };
    };

    // ── Gestalt midpoint (red) — junction of segment A and B ───────────
    renderer.setInkColor(200, 50, 50);
    renderer.drawFills([dot(33.66, 75.39, 1.8)]);

    // ── Endpoints of path3 (blue) ─────────────────────────────────────
    renderer.setInkColor(50, 80, 200);
    renderer.drawFills([
      dot(25.86, 75.95, 1.3),  // path3 start (bottom of t downstroke)
      dot(60.03, 55.13, 1.3),  // path3 end (start of o loop)
    ]);
  }, []);


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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => {
            const svg = exportAlphabetSVG();
            const a = document.createElement('a');
            a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            a.download = 'matlack-alphabet.svg';
            a.click();
          }} style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
            export svg
          </button>
          <button onClick={() => {
            const json = exportGlyphsForFont();
            const a = document.createElement('a');
            a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
            a.download = 'matlack-glyphs.json';
            a.click();
          }} style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
            export json
          </button>
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

      {/* Translucent reference-image overlay (Matlack's 'to' scan). */}
      <img
        src={toRefImage}
        alt="Matlack 'to' reference"
        style={{
          position: 'fixed',
          left:   `${overlay.left}px`,
          top:    `${overlay.top}px`,
          width:  `${overlay.width}px`,
          height: `${overlay.height}px`,
          opacity: 0.55,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Rule lines (drawn on top of the reference image for visibility). */}
      {[
        { y: 20, label: 'rule.y-top'    },
        { y: 48, label: 'rule.y-center' },
        { y: 76, label: 'rule.y-bottom' },
      ].map(({ y, label }) => {
        const topPx = winSize.h / 2 + (y - 55) * cssScale;
        return (
          <div key={label} style={{
            position: 'fixed', zIndex: 3, pointerEvents: 'none',
            left: 0, right: 0, top: `${topPx}px`,
            borderTop: '1px dashed #888',
          }}>
            <span style={{
              position: 'absolute', right: 8, top: -8,
              background: 'rgba(245,243,240,0.9)',
              padding: '1px 4px', fontSize: 10,
              fontFamily: 'monospace', color: '#666',
            }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
