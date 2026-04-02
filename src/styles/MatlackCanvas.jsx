import { useRef, useEffect, useState } from 'react';
import { createStrokeRenderer } from './strokeRenderer.js';
import { renderA, renderB, renderAAnimated, renderAFadeBowlThenStroke, renderAFadeAll, B_ELLIPSE_DATA } from './matlackGlyphs.js';

/**
 * Full-screen WebGL canvas for Matlack handwriting R&D.
 */
export default function MatlackCanvas() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const animRef = useRef(null);
  const [speed, setSpeed] = useState('1x');
  const [mode, setMode] = useState('sweep');
  const [animating, setAnimating] = useState(false);

  const speedMs = { '0.25x': 8000, '0.5x': 4000, '1x': 2000, '2x': 1000, '4x': 500 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      antialias: true, preserveDrawingBuffer: true, alpha: false,
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
      renderer.clear();
      renderer.setInkColor(30, 38, 58);
      renderA(renderer, canvas.width * 0.30, canvas.height * 0.45, 90, dpr);
      renderB(renderer, canvas.width * 0.60, canvas.height * 0.50, 90, dpr);
    }

    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

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
      renderer.setInkColor(30, 38, 58);
      const cx = canvas.width * 0.30, cy = canvas.height * 0.45;
      if (mode === 'sweep') {
        renderAAnimated(renderer, cx, cy, 90, dpr, progress);
      } else if (mode === 'fade-parts') {
        renderer.clear();
        renderAFadeBowlThenStroke(renderer, cx, cy, 90, dpr, progress);
      } else {
        renderer.clear();
        renderAFadeAll(renderer, cx, cy, 90, dpr, progress);
      }
      if (progress < 1.0) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        setAnimating(false);
        animRef.current = null;
      }
    }
    animRef.current = requestAnimationFrame(frame);
  }

  // ── Reference strip: 'b' refs with ellipse overlays ────────────────────────
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
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 4px' }}>
            <option value="sweep">sweep</option>
            <option value="fade-parts">fade bowl+stroke</option>
            <option value="fade-all">fade all</option>
          </select>
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
      <canvas ref={canvasRef}
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                 display: 'block', cursor: 'crosshair' }} />
    </div>
  );
}
