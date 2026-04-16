import { useRef, useCallback } from 'react';
import { renderGlyph } from './matlackGlyphs.js';
import { exportAlphabetSVG, exportGlyphsForFont } from './matlackSVGExport.js';
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
    const row1 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const row2 = ['m', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x'];
    const row3 = ['y', 'z'];
    const letters = [...row1, ...row2, ...row3];
    const cols = 10;
    const colSpacing = 0.85 / cols;
    letters.forEach((l, i) => {
      let row, col;
      if (i < row1.length) { row = 0; col = i; }
      else if (i < row1.length + row2.length) { row = 1; col = i - row1.length; }
      else { row = 2; col = i - row1.length - row2.length; }
      const cx = canvas.width * (0.05 + col * colSpacing);
      const cy = canvas.height * (0.20 + row * 0.30);
      renderGlyph(l, renderer, cx, cy, sz, dpr);
    });
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
    </div>
  );
}
