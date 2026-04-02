import { useRef, useEffect, useState } from 'react';
import { createStrokeRenderer } from './strokeRenderer.js';
import { renderA, renderAAnimated, ELLIPSE_DATA } from './matlackGlyphs.js';

/**
 * Full-screen WebGL canvas for Matlack handwriting R&D.
 * Renders letter(s) with optional animation and reference strip.
 */
export default function MatlackCanvas() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const animRef = useRef(null);
  const [speed, setSpeed] = useState('1x');
  const [animating, setAnimating] = useState(false);

  const speedMs = { '0.25x': 8000, '0.5x': 4000, '1x': 2000, '2x': 1000, '4x': 500 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    if (!gl) return;

    const renderer = createStrokeRenderer(gl);
    rendererRef.current = renderer;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      renderer.clear();  // start blank — animate button triggers first draw
    }

    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  function drawStatic(renderer, canvas, dpr) {
    renderer.clear();
    renderer.setInkColor(30, 38, 58);
    renderA(renderer, canvas.width * 0.5, canvas.height * 0.45, 90, dpr);
  }

  function startAnimation() {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    if (animRef.current) cancelAnimationFrame(animRef.current);
    setAnimating(true);

    const dpr = window.devicePixelRatio || 1;
    const duration = speedMs[speed] || 2000;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);

      // Never clear during animation — ink is permanent.
      renderer.setInkColor(30, 38, 58);
      renderAAnimated(renderer, canvas.width * 0.5, canvas.height * 0.45, 90, dpr, progress);

      if (progress < 1.0) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        setAnimating(false);
        animRef.current = null;
      }
    }

    animRef.current = requestAnimationFrame(frame);
  }

  // ── Reference strip ────────────────────────────────────────────────────────
  const REF_H = 80;

  function RefWithEllipse({ idx }) {
    const key = String(idx).padStart(2, '0');
    const src = `/ref/a/${key}.png`;
    const d = ELLIPSE_DATA[key];
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
                fill="none" stroke="cyan" strokeWidth="1.2" opacity="0.85" />
            )}
            {outer && (
              <ellipse
                cx={outer.cx * scale} cy={outer.cy * scale}
                rx={outer.a * scale} ry={outer.b * scale}
                transform={`rotate(${outer.tilt} ${outer.cx * scale} ${outer.cy * scale})`}
                fill="none" stroke="magenta" strokeWidth="1.0" opacity="0.6"
                strokeDasharray="3 2" />
            )}
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar: references + controls */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px',
        background: 'rgba(245,243,240,0.95)',
        borderBottom: '1px solid #ccc',
        fontFamily: 'monospace', fontSize: 11, color: '#666',
      }}>
        <span style={{ marginRight: 4 }}>ref:</span>
        {Array.from({ length: 10 }, (_, i) => (
          <RefWithEllipse key={i} idx={i + 1} />
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={speed} onChange={e => setSpeed(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 4px' }}>
            {Object.keys(speedMs).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => rendererRef.current?.clear()}
            style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
            clear
          </button>
          <button onClick={startAnimation} disabled={animating}
            style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>
            {animating ? 'drawing...' : 'animate'}
          </button>
        </div>
      </div>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100vw', height: '100vh',
          display: 'block', cursor: 'crosshair',
        }}
      />
    </div>
  );
}
