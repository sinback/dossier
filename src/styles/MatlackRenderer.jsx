import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createStrokeRenderer } from './strokeRenderer.js';

/**
 * Embeddable WebGL canvas that fills its container.
 *
 * Props:
 *   onDraw(renderer, canvas) — called on mount and every resize.
 *                              Parent is responsible for clearing and drawing.
 *   style / className        — applied to the wrapper div.
 *
 * Ref API (via forwardRef):
 *   .renderer   — the createStrokeRenderer instance, or null before mount
 *   .canvas     — the <canvas> element, or null before mount
 *   .clear()    — convenience: clears the renderer
 */
const MatlackRenderer = forwardRef(function MatlackRenderer(
  { onDraw, style, className },
  ref,
) {
  const canvasRef  = useRef(null);
  const wrapperRef = useRef(null);
  const rendererRef = useRef(null);

  useImperativeHandle(ref, () => ({
    get renderer() { return rendererRef.current; },
    get canvas()   { return canvasRef.current; },
    clear() { rendererRef.current?.clear(); },
  }));

  useEffect(() => {
    const canvas  = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    if (!gl) return;

    const renderer = createStrokeRenderer(gl);
    rendererRef.current = renderer;

    function handleResize() {
      const dpr = window.devicePixelRatio || 1;
      const w   = wrapper.offsetWidth;
      const h   = wrapper.offsetHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = w + 'px';
      canvas.style.height = h + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      onDraw?.(renderer, canvas);
    }

    const ro = new ResizeObserver(handleResize);
    ro.observe(wrapper);
    handleResize();

    return () => { ro.disconnect(); };
  // onDraw intentionally excluded — parent should stabilise it with useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
      className={className}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
});

export default MatlackRenderer;
