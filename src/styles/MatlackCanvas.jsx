import { useRef, useCallback, useState, useEffect } from 'react';
import { sampleSegments, buildRibbon, renderGlyph,
         GLYPH_RULES, GLYPH_REF_CENTERS, GLYPH_STRUCTURAL_ANCHORS,
         glyphToScanTransform } from './matlackGlyphs.js';
import { exportAlphabetSVG, exportGlyphsForFont } from './matlackSVGExport.js';
import MatlackRenderer from './MatlackRenderer.jsx';
import to01     from '../../matlack-declaration/reference/context/to/01.png';
import to02     from '../../matlack-declaration/reference/context/to/02.png';
import to03     from '../../matlack-declaration/reference/context/to/03.png';
import to04     from '../../matlack-declaration/reference/context/to/04.png';
import to05     from '../../matlack-declaration/reference/context/to/05.png';
import to06     from '../../matlack-declaration/reference/context/to/06.png';
import to07     from '../../matlack-declaration/reference/context/to/07.png';
import tobe01   from '../../matlack-declaration/reference/context/to be/01.png';
import tothe01  from '../../matlack-declaration/reference/context/to the/01.png';
import or01     from '../../matlack-declaration/reference/context/or/01.png';
import for01    from '../../matlack-declaration/reference/context/for/01.png';

/**
 * Per-context review data: image, its pixel size (used as the svg
 * viewBox), a centerpoint for placement, rule-line y-values, optionally
 * a traced path and a chosen anchor.
 *
 * Rule lines are initial estimates — eyeball corrections expected.
 *
 * glyphScale: scale factor fed to renderGlyph (size arg). Default 100.
 *   Tune per context until the rendered glyph visually matches the scan.
 *
 * glyphLetters: array of {letter, variant, anchorSvg?} to render in overlay mode.
 *   anchorSvg is the SVG-space point where the glyph's own internal
 *   reference center should be placed. If null, falls back to ctx.ref.
 */

// Single-curve t→o transition as a straight line between the blue endpoints.
// Used for scans where we haven't traced a proper pen path yet — just a
// visual cue of "this is roughly the transition span Claude is eyeballing."
const straightPath = (p0, p3) => [[p0, p0, p3, p3]];

const CONTEXTS = {
  to: {
    label: 'to/01',
    image: to01,
    filePath: 'matlack-declaration/reference/context/to/01.png',
    viewBoxW: 116, viewBoxH: 89,
    ref: { x: 58, y: 55 },
    rule: { yTop: 20, yCenter: 48, yBottom: 76 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: [
      [[25.86, 75.95], [25.59, 76.19], [32.97, 76.01], [33.66, 75.39]],
      [[33.66, 75.39], [36.06, 76.97], [60.13, 55.20], [60.03, 55.13]],
    ],
    path3Endpoints: [[25.86, 75.95], [60.03, 55.13]],
    anchor: { x: 41.25, y: 71.64 },
  },
  'to/02': {
    label: 'to/02',
    image: to02,
    filePath: 'matlack-declaration/reference/context/to/02.png',
    viewBoxW: 241, viewBoxH: 153,
    ref: { x: 120, y: 76 },
    rule: { yTop: 17, yCenter: 67, yBottom: 117 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: [
      [[73.41, 122.01], [74.22, 122.46], [106.25, 102.02], [106.66, 102.65]],
      [[106.66, 102.65], [108.37, 99.15], [139.32, 65.80], [141.67, 73.20]],
    ],
    path3Endpoints: [[73, 122], [142, 73]],
    anchor: { x: 96, y: 109 },
  },
  'to/03': {
    label: 'to/03',
    image: to03,
    filePath: 'matlack-declaration/reference/context/to/03.png',
    viewBoxW: 235, viewBoxH: 168,
    ref: { x: 117, y: 84 },
    rule: { yTop: 35, yCenter: 85, yBottom: 140 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: straightPath([105, 138], [170, 95]),
    path3Endpoints: [[105, 138], [170, 95]],
    anchor: { x: 135, y: 130 },
  },
  'to/04': {
    label: 'to/04',
    image: to04,
    filePath: 'matlack-declaration/reference/context/to/04.png',
    viewBoxW: 302, viewBoxH: 180,
    ref: { x: 151, y: 90 },
    rule: { yTop: 25, yCenter: 80, yBottom: 135 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: straightPath([115, 130], [200, 85]),
    path3Endpoints: [[115, 130], [200, 85]],
    anchor: { x: 150, y: 125 },
  },
  'to/05': {
    label: 'to/05',
    image: to05,
    filePath: 'matlack-declaration/reference/context/to/05.png',
    viewBoxW: 286, viewBoxH: 222,
    ref: { x: 143, y: 111 },
    rule: { yTop: 65, yCenter: 124, yBottom: 182 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: [
      [[93.86, 183.48], [94.29, 183.61], [127.01, 160.03], [125.33, 159.51]],
      [[125.33, 159.51], [124.58, 158.66], [148.11, 139.04], [148.48, 139.33]],
    ],
    path3Endpoints: [[83, 187], [157, 132]],
    anchor: { x: 100, y: 181 },
  },
  'to/06': {
    label: 'to/06',
    image: to06,
    filePath: 'matlack-declaration/reference/context/to/06.png',
    viewBoxW: 251, viewBoxH: 187,
    ref: { x: 125, y: 93 },
    rule: { yTop: 45, yCenter: 100, yBottom: 155 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: straightPath([115, 150], [175, 110]),
    path3Endpoints: [[115, 150], [175, 110]],
    anchor: { x: 140, y: 148 },
  },
  'to/07': {
    label: 'to/07',
    image: to07,
    filePath: 'matlack-declaration/reference/context/to/07.png',
    viewBoxW: 290, viewBoxH: 166,
    ref: { x: 145, y: 83 },
    rule: { yTop: 30, yCenter: 75, yBottom: 130 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: straightPath([90, 128], [165, 85]),
    path3Endpoints: [[90, 128], [165, 85]],
    anchor: { x: 120, y: 122 },
  },
  'to be': {
    label: 'to be',
    image: tobe01,
    filePath: 'matlack-declaration/reference/context/to be/01.png',
    viewBoxW: 317, viewBoxH: 175,
    ref: { x: 158, y: 87 },
    rule: { yTop: 25, yCenter: 80, yBottom: 140 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: straightPath([80, 135], [130, 90]),
    path3Endpoints: [[80, 135], [130, 90]],
    anchor: { x: 100, y: 130 },
  },
  'to the': {
    label: 'to the',
    image: tothe01,
    filePath: 'matlack-declaration/reference/context/to the/01.png',
    viewBoxW: 425, viewBoxH: 157,
    ref: { x: 212, y: 78 },
    rule: { yTop: 20, yCenter: 75, yBottom: 125 },
    glyphScale: 100,
    glyphLetters: [
      { letter: 't', variant: null,                         anchorSvg: null },
      { letter: 'o', variant: { entry: 'low', exit: 'high' }, anchorSvg: null },
    ],
    path3: straightPath([75, 120], [130, 80]),
    path3Endpoints: [[75, 120], [130, 80]],
    anchor: { x: 100, y: 115 },
  },
  or: {
    label: 'or',
    image: or01,
    filePath: 'matlack-declaration/reference/context/or/01.png',
    viewBoxW: 85, viewBoxH: 64,
    ref: { x: 42, y: 32 },
    // Re-calibrated from path data: r downstroke starts at y≈23 in the scan
    // (path1 start), so rule.y-center is ~23, not 28 as originally guessed.
    rule: { yTop: -2, yCenter: 23, yBottom: 48 },
    glyphScale: 100,
    // Overlay uses structural anchors (stable body features), not join
    // anchors. Join anchors (exit/entry) still marked as red/magenta dots
    // via exitAnchor / entryAnchor below.
    glyphLetters: [
      { letter: 'o', variant: { entry: 'low', exit: 'high' },
        structural: { name: 'bowlCenter', svg: { x: 25.2, y: 33.5 } } },
      { letter: 'r', variant: { entry: 'low',  exit: 'low' },
        structural: { name: 'downstrokeTop', svg: { x: 53.64, y: 23.21 } },
        color: [40, 140, 220] },
      { letter: 'r', variant: { entry: 'high', exit: 'low' },
        structural: { name: 'downstrokeTop', svg: { x: 53.64, y: 23.21 } },
        color: [40, 180, 90] },
    ],
    path3: [
      [[37.73, 24.30], [37.19, 24.48], [38.04, 32.53], [39.72, 31.97]],
      [[39.72, 31.97], [39.55, 32.41], [48.29, 29.88], [48.59, 29.09]],
      [[48.59, 29.09], [49.74, 29.88], [55.60, 23.51], [54.97, 23.07]],
    ],
    path3Endpoints: [[37.73, 24.30], [54.97, 23.07]],
    anchor: null,
    exitAnchor:  { x: 46.22, y: 30.11 },  // o.exit
    entryAnchor: { x: 43.12, y: 30.87 },  // r.entry
  },
  for: {
    label: 'for',
    image: for01,
    filePath: 'matlack-declaration/reference/context/for/01.png',
    viewBoxW: 238, viewBoxH: 214,
    ref: { x: 119, y: 107 },
    rule: { yTop: 19, yCenter: 96, yBottom: 172 },
    glyphScale: 100,
    glyphLetters: [
      // f uses legacy manual placement until f has rule-line metadata.
      { letter: 'f', variant: null,
        anchorSvg: { x: 93.53, y: 105.40 }, color: [40, 140, 220] },
      { letter: 'o', variant: { entry: 'high', exit: 'high' },
        structural: { name: 'bowlCenter', svg: { x: 113, y: 108 } } },
      { letter: 'r', variant: { entry: 'high', exit: 'low' },
        structural: { name: 'downstrokeTop', svg: { x: 159.31, y: 85.54 } },
        color: [40, 180, 90] },
    ],
    path3: [
      // f Exit → o Entry (path4)
      [[70.13, 104.10], [70.34, 108.89], [97.64, 107.03], [99.22, 103.05]],
      [[99.22, 103.05], [100.63, 104.43], [108.50, 97.61], [108.65, 97.08]],
      [[108.65, 97.08], [108.32, 95.01], [125.80, 86.98], [125.90, 87.58]],
      // o Exit → r Entry (path2)
      [[126.41, 87.26], [125.48, 87.92], [132.97, 101.96], [135.77, 99.99]],
      [[135.77, 99.99], [135.73, 101.21], [146.84, 100.36], [146.92, 98.13]],
      [[146.92, 98.13], [146.92, 98.13], [160.27, 85.55], [160.27, 85.63]],
    ],
    path3Endpoints: [[70.13, 104.10], [160.27, 85.63]],
    anchor: null,
    exitAnchor:  { x: 147.66, y: 96.94 },
    entryAnchor: { x: 139.02, y: 100.23 },
    fExit:  { x: 93.53, y: 105.40 },
    oEntry: { x: 81.25, y: 107.29 },
  },
};

// Common anchor label suggestions shown in the anchor-save dropdown.
const ANCHOR_LABEL_SUGGESTIONS = [
  'o.exit', 'o.entry', 'r.entry', 'r.exit',
  'f.exit', 'f.entry', 't.exit', 't.entry',
  'e.exit', 'e.entry', 'a.exit', 'a.entry',
];

export default function MatlackCanvas() {
  const matlackRef = useRef(null);

  const [contextKey, setContextKey] = useState('to');
  const ctx = CONTEXTS[contextKey];

  const [winSize, setWinSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth  : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [mouseSvg, setMouseSvg]   = useState(null);
  const [mouseCss, setMouseCss]   = useState({ x: 0, y: 0 });
  const [justCopied, setJustCopied] = useState(null);

  // ── Task 1: glyph overlay state ────────────────────────────────────────────
  const [overlayOn, setOverlayOn] = useState(false);
  // Legacy scale knob for glyphs without structural-anchor metadata (falls
  // back here if spec.structural is missing). Fixed; not user-adjustable.
  const legacyGlyphScale = ctx.glyphScale ?? 100;

  // ── Task 2: FS browser panel state ────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [fsContexts, setFsContexts]     = useState([]);   // [{dir,png,hasAnchors,viewBoxW,viewBoxH}]
  const [sidebarCollapsed, setSidebarCollapsed] = useState({}); // {dir: bool}

  useEffect(() => {
    if (!sidebarOpen) return;
    fetch('/api/contexts')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setFsContexts(data);
      })
      .catch(() => {});
  }, [sidebarOpen]);

  // ── Task 3: anchor-save state ──────────────────────────────────────────────
  // clickMode: 'copy' (original) | 'save' (labeled save)
  const [clickMode, setClickMode] = useState('copy');
  const [anchorForm, setAnchorForm] = useState(null); // {x, y, cssX, cssY} or null
  const [anchorLabel, setAnchorLabel] = useState('');
  const [anchorSaving, setAnchorSaving] = useState(false);
  const [anchorFlash, setAnchorFlash] = useState(null); // {text, x, y}
  // Loaded anchors for the current context, keyed by label.
  const [loadedAnchors, setLoadedAnchors] = useState({}); // { [label]: {x,y} }

  // Load anchors whenever context changes.
  useEffect(() => {
    if (!ctx.filePath) { setLoadedAnchors({}); return; }
    fetch(`/api/anchors?path=${encodeURIComponent(ctx.filePath)}`)
      .then(r => r.json())
      .then(data => { if (data?.labels) setLoadedAnchors(data.labels); })
      .catch(() => setLoadedAnchors({}));
  }, [contextKey, ctx.filePath]);

  // Fit factor: image occupies ~83% of the tightest viewport dimension.
  const cssScale = 0.83 * Math.min(
    winSize.w / ctx.viewBoxW,
    winSize.h / ctx.viewBoxH,
  );
  const overlay = {
    left:   winSize.w / 2 - ctx.ref.x * cssScale,
    top:    winSize.h / 2 - ctx.ref.y * cssScale,
    width:  ctx.viewBoxW * cssScale,
    height: ctx.viewBoxH * cssScale,
  };

  const handleDraw = useCallback((renderer, canvas) => {
    renderer.clear();
    const REF   = ctx.ref;
    const scale = 0.83 * Math.min(
      canvas.width  / ctx.viewBoxW,
      canvas.height / ctx.viewBoxH,
    );
    const cx0 = canvas.width / 2;
    const cy0 = canvas.height / 2;
    const toCanvas = (sx, sy) => ({
      x: cx0 + (sx - REF.x) * scale,
      y: cy0 + (sy - REF.y) * scale,
    });

    // path3 curve, if the context has one traced.
    if (ctx.path3) {
      renderer.setInkColor(30, 38, 58);
      const segIdxs = ctx.path3.map((_, i) => i);
      const path3Center = sampleSegments(ctx.path3, segIdxs, 16,
        cx0, cy0, scale, REF);
      const path3Quads = buildRibbon(path3Center, () => 0.9 * scale);
      renderer.drawFills(
        path3Quads.map(q => ({ points: q, pressure: 0.85 }))
      );
    }

    const dot = (sx, sy, radius = 1.5) => {
      const n = 16;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        pts.push(toCanvas(sx + radius * Math.cos(a), sy + radius * Math.sin(a)));
      }
      return { points: pts, pressure: 0.95 };
    };

    // Legacy single "gestalt midpoint" anchor (red). Older scans only.
    if (ctx.anchor) {
      renderer.setInkColor(200, 50, 50);
      renderer.drawFills([dot(ctx.anchor.x, ctx.anchor.y, 1.8)]);
    }

    // Two-anchor model (curs-aligned). Red = exit; magenta = entry.
    const exitAnchors  = [ctx.exitAnchor,  ctx.fExit ].filter(Boolean);
    const entryAnchors = [ctx.entryAnchor, ctx.oEntry].filter(Boolean);
    if (exitAnchors.length) {
      renderer.setInkColor(200, 50, 50);
      renderer.drawFills(exitAnchors.map(a => dot(a.x, a.y, 1.8)));
    }
    if (entryAnchors.length) {
      renderer.setInkColor(170, 50, 180);
      renderer.drawFills(entryAnchors.map(a => dot(a.x, a.y, 1.8)));
    }

    // Endpoints of path3 (blue), if we have them.
    if (ctx.path3Endpoints) {
      renderer.setInkColor(50, 80, 200);
      renderer.drawFills(ctx.path3Endpoints.map(([x, y]) => dot(x, y, 1.3)));
    }

    // ── Task 1: glyph overlay ────────────────────────────────────────────────
    // overlayOn and currentGlyphScale are captured via the outer closure
    // because handleDraw is recreated whenever those change (via deps below).
    if (overlayOn && ctx.glyphLetters?.length) {
      const dpr = window.devicePixelRatio || 1;
      for (const spec of ctx.glyphLetters) {
        const [r, g, b] = spec.color ?? [40, 140, 220];
        renderer.setInkColor(r, g, b);

        // Prefer computed alignment via rule lines + STRUCTURAL anchor.
        // Falls back to manual glyphScale if the letter has no metadata or
        // the spec doesn't declare a structural anchor.
        let gcx, gcy, gsize;
        const glyphRule = GLYPH_RULES[spec.letter];
        const structural = spec.structural;
        const glyphAnchor = structural
          ? GLYPH_STRUCTURAL_ANCHORS[spec.letter]?.[structural.name]
          : null;
        const haveMetadata = glyphRule && structural && glyphAnchor;

        if (haveMetadata) {
          const t = glyphToScanTransform(
            ctx.rule, glyphRule, structural.svg, glyphAnchor,
          );
          const refC = GLYPH_REF_CENTERS[spec.letter];
          const scanRefX = t.offsetX + t.scale * refC.x;
          const scanRefY = t.offsetY + t.scale * refC.y;
          gcx = cx0 + (scanRefX - REF.x) * scale;
          gcy = cy0 + (scanRefY - REF.y) * scale;
          // renderGlyph internal scale is (size * dpr) / 100; want it to
          // equal (t.scale * scale) canvas-px per glyph-unit.
          gsize = (t.scale * scale * 100) / dpr;
        } else {
          // Legacy manual placement: anchorSvg marks where REF_CENTER lands.
          const anchorPt = spec.anchorSvg ?? REF;
          gcx = cx0 + (anchorPt.x - REF.x) * scale;
          gcy = cy0 + (anchorPt.y - REF.y) * scale;
          gsize = legacyGlyphScale;
        }

        try {
          renderGlyph(
            spec.letter, renderer, gcx, gcy, gsize, dpr,
            {},  // overrides
            spec.variant ?? undefined,
          );
        } catch (err) {
          console.warn('renderGlyph overlay error:', spec.letter, err.message);
        }
      }
      // Restore ink to default dark for any subsequent draws
      renderer.setInkColor(30, 38, 58);
    }
  }, [ctx, overlayOn, legacyGlyphScale]);

  // Re-draw when the context (and therefore handleDraw) changes.
  useEffect(() => {
    const r = matlackRef.current?.renderer;
    const c = matlackRef.current?.canvas;
    if (r && c) handleDraw(r, c);
  }, [handleDraw]);

  const cssToSvg = (cssX, cssY) => ({
    x: ctx.ref.x + (cssX - winSize.w / 2) / cssScale,
    y: ctx.ref.y + (cssY - winSize.h / 2) / cssScale,
  });

  const handleMouseMove = (e) => {
    setMouseCss({ x: e.clientX, y: e.clientY });
    setMouseSvg(cssToSvg(e.clientX, e.clientY));
  };

  const handleClick = (e) => {
    if (!mouseSvg) return;
    // Don't hijack clicks on interactive UI (buttons, inputs, etc.).
    if (e.target.closest('button,input,select,label')) return;
    // If anchor form is open, clicking canvas closes it (without saving).
    if (anchorForm) { setAnchorForm(null); return; }

    if (clickMode === 'copy') {
      const txt = `${mouseSvg.x.toFixed(2)}, ${mouseSvg.y.toFixed(2)}`;
      navigator.clipboard?.writeText(txt);
      setJustCopied({ text: txt, x: e.clientX, y: e.clientY });
      setTimeout(() => setJustCopied(null), 900);
    } else {
      // 'save' mode: open anchor form
      setAnchorForm({ x: mouseSvg.x, y: mouseSvg.y, cssX: e.clientX, cssY: e.clientY });
      setAnchorLabel('');
    }
  };

  const submitAnchor = async () => {
    if (!anchorForm || !anchorLabel.trim() || !ctx.filePath) return;
    setAnchorSaving(true);
    try {
      const resp = await fetch('/api/anchors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: ctx.filePath,
          label: anchorLabel.trim(),
          x: anchorForm.x,
          y: anchorForm.y,
        }),
      });
      if (resp.ok) {
        const newLabel = anchorLabel.trim();
        setLoadedAnchors(prev => ({ ...prev, [newLabel]: { x: anchorForm.x, y: anchorForm.y } }));
        setAnchorFlash({ text: `saved ${newLabel}`, x: anchorForm.cssX, y: anchorForm.cssY });
        setTimeout(() => setAnchorFlash(null), 900);
        setAnchorForm(null);
      }
    } catch (err) {
      console.error('anchor save error', err);
    } finally {
      setAnchorSaving(false);
    }
  };

  const btnStyle = (active) => ({
    fontFamily: 'monospace', fontSize: 11, padding: '2px 8px',
    cursor: 'pointer',
    background: active ? '#333' : '#fff',
    color:      active ? '#fff' : '#333',
    border: '1px solid #bbb',
  });

  // Group fsContexts by dir for the sidebar panel
  const fsByDir = {};
  for (const item of fsContexts) {
    if (!fsByDir[item.dir]) fsByDir[item.dir] = [];
    fsByDir[item.dir].push(item);
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}
         onMouseMove={handleMouseMove}
         onMouseLeave={() => setMouseSvg(null)}
         onClick={handleClick}>

      {/* Toolbar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 6,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px',
        background: 'rgba(245,243,240,0.95)',
        borderBottom: '1px solid #ccc',
        fontFamily: 'monospace', fontSize: 11, color: '#666',
      }}>
        {/* Task 2: sidebar toggle */}
        <button onClick={() => setSidebarOpen(v => !v)} style={btnStyle(sidebarOpen)}
                title="Browse all context PNGs">
          {sidebarOpen ? '◀ files' : '▶ files'}
        </button>

        {/* Context switcher */}
        <span style={{ color: '#888' }}>context:</span>
        {Object.keys(CONTEXTS).map(k => (
          <button key={k}
                  onClick={() => setContextKey(k)}
                  style={btnStyle(k === contextKey)}>
            {CONTEXTS[k].label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setOverlayOn(v => !v)} style={btnStyle(overlayOn)}>
            overlay glyph
          </button>

          {/* Task 3: click mode toggle */}
          <span style={{ color: '#888', marginLeft: 4 }}>click:</span>
          <button onClick={() => setClickMode('copy')} style={btnStyle(clickMode === 'copy')}>
            quick copy
          </button>
          <button onClick={() => setClickMode('save')} style={btnStyle(clickMode === 'save')}>
            labeled save
          </button>

          <button onClick={() => {
            const svg = exportAlphabetSVG();
            const a = document.createElement('a');
            a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            a.download = 'matlack-alphabet.svg';
            a.click();
          }} style={btnStyle(false)}>export svg</button>
          <button onClick={() => {
            const json = exportGlyphsForFont();
            const a = document.createElement('a');
            a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
            a.download = 'matlack-glyphs.json';
            a.click();
          }} style={btnStyle(false)}>export json</button>
          <button onClick={() => {
            if (!ctx.filePath) return;
            fetch('/api/open', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: ctx.filePath }),
            });
          }} style={btnStyle(false)}>open in GIMP</button>
          <button onClick={() => matlackRef.current?.clear()}
                  style={btnStyle(false)}>clear</button>
        </div>
      </div>

      {/* Task 2: FS browser sidebar */}
      {sidebarOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 5,
          width: 220, overflowY: 'auto',
          background: 'rgba(245,243,240,0.97)',
          borderRight: '1px solid #ccc',
          paddingTop: 30, paddingBottom: 12,
          fontFamily: 'monospace', fontSize: 11, color: '#333',
        }}>
          {Object.keys(fsByDir).length === 0 && (
            <div style={{ padding: '8px 12px', color: '#999' }}>loading…</div>
          )}
          {Object.entries(fsByDir).map(([dir, items]) => {
            const collapsed = sidebarCollapsed[dir] ?? false;
            return (
              <div key={dir}>
                <div
                  onClick={() => setSidebarCollapsed(prev => ({ ...prev, [dir]: !collapsed }))}
                  style={{
                    padding: '3px 10px', cursor: 'pointer', fontWeight: 'bold',
                    background: 'rgba(220,218,215,0.7)', borderBottom: '1px solid #ddd',
                    userSelect: 'none',
                  }}
                >
                  {collapsed ? '▶' : '▼'} {dir}
                </div>
                {!collapsed && items.map(item => {
                  const isActive = ctx.filePath === item.relativePath;
                  return (
                    <div
                      key={item.png}
                      onClick={() => {
                        // Only switch to contexts that are in CONTEXTS map.
                        // For unregistered scans, just note them (no-op for now).
                        const match = Object.keys(CONTEXTS).find(
                          k => CONTEXTS[k].filePath === item.relativePath
                        );
                        if (match) setContextKey(match);
                      }}
                      style={{
                        padding: '2px 12px 2px 20px',
                        cursor: 'pointer',
                        background: isActive ? '#e0ecff' : 'transparent',
                        color: isActive ? '#124' : '#444',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: item.hasAnchors ? '#4a9' : '#ccc',
                        flexShrink: 0,
                      }} title={item.hasAnchors ? 'has anchors' : 'no anchors'} />
                      <span>{item.png}</span>
                      {item.viewBoxW > 0 && (
                        <span style={{ color: '#aaa', marginLeft: 'auto' }}>
                          {item.viewBoxW}×{item.viewBoxH}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Canvas */}
      <MatlackRenderer
        ref={matlackRef}
        onDraw={handleDraw}
        style={{ position: 'fixed', top: 0, left: 0, cursor: 'crosshair' }}
      />

      {/* Reference image overlay. */}
      <img
        key={contextKey}
        src={ctx.image}
        alt={`Matlack '${ctx.label}' reference`}
        style={{
          position: 'fixed',
          left:   `${overlay.left}px`,
          top:    `${overlay.top}px`,
          width:  `${overlay.width}px`,
          height: `${overlay.height}px`,
          // More opaque during overlay mode so the ink pops against the
          // color-coded glyphs; translucent otherwise so anchor dots and
          // path3 annotations read through cleanly.
          opacity: overlayOn ? 0.9 : 0.55,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* "Copied!" flash after click (quick-copy mode) */}
      {justCopied && (
        <div style={{
          position: 'fixed', zIndex: 6, pointerEvents: 'none',
          left:    `${justCopied.x + 12}px`,
          top:     `${justCopied.y - 18}px`,
          fontFamily: 'monospace', fontSize: 11,
          color: '#fff', background: 'rgba(40, 120, 60, 0.95)',
          padding: '2px 6px', borderRadius: 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}>
          copied {justCopied.text}
        </div>
      )}

      {/* "Saved!" flash after anchor save */}
      {anchorFlash && (
        <div style={{
          position: 'fixed', zIndex: 8, pointerEvents: 'none',
          left:    `${anchorFlash.x + 12}px`,
          top:     `${anchorFlash.y - 18}px`,
          fontFamily: 'monospace', fontSize: 11,
          color: '#fff', background: 'rgba(40, 80, 180, 0.95)',
          padding: '2px 6px', borderRadius: 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}>
          {anchorFlash.text}
        </div>
      )}

      {/* Task 3: anchor-save floating form */}
      {anchorForm && (
        <div
          style={{
            position: 'fixed', zIndex: 9,
            left: Math.min(anchorForm.cssX + 16, winSize.w - 230),
            top:  Math.min(anchorForm.cssY + 8,  winSize.h - 130),
            background: 'rgba(245,243,240,0.98)',
            border: '1px solid #aac',
            borderRadius: 4,
            padding: '8px 10px',
            fontFamily: 'monospace', fontSize: 11, color: '#234',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            width: 210,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ marginBottom: 5, color: '#555' }}>
            save anchor · svg ({anchorForm.x.toFixed(2)}, {anchorForm.y.toFixed(2)})
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <select
              value={ANCHOR_LABEL_SUGGESTIONS.includes(anchorLabel) ? anchorLabel : '__custom'}
              onChange={e => { if (e.target.value !== '__custom') setAnchorLabel(e.target.value); }}
              style={{
                fontFamily: 'monospace', fontSize: 11,
                border: '1px solid #bbb', flex: '0 0 auto',
              }}
            >
              <option value="__custom">custom…</option>
              {ANCHOR_LABEL_SUGGESTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              type="text"
              value={anchorLabel}
              onChange={e => setAnchorLabel(e.target.value)}
              placeholder="label"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') submitAnchor();
                if (e.key === 'Escape') setAnchorForm(null);
              }}
              style={{
                fontFamily: 'monospace', fontSize: 11, flex: 1,
                border: '1px solid #bbb', padding: '1px 4px',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={submitAnchor}
              disabled={!anchorLabel.trim() || anchorSaving}
              style={{ ...btnStyle(true), flex: 1 }}
            >
              {anchorSaving ? 'saving…' : 'save'}
            </button>
            <button onClick={() => setAnchorForm(null)} style={{ ...btnStyle(false) }}>
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Loaded anchors display (small dots on canvas overlay, CSS layer) */}
      {Object.entries(loadedAnchors).map(([label, pt]) => {
        const cssX = winSize.w / 2 + (pt.x - ctx.ref.x) * cssScale;
        const cssY = winSize.h / 2 + (pt.y - ctx.ref.y) * cssScale;
        return (
          <div key={label} style={{
            position: 'fixed', zIndex: 4, pointerEvents: 'none',
            left: cssX - 4, top: cssY - 4,
            width: 8, height: 8, borderRadius: '50%',
            background: 'rgba(40,80,200,0.7)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            <span style={{
              position: 'absolute', left: 10, top: -3,
              fontFamily: 'monospace', fontSize: 9, color: '#246',
              background: 'rgba(255,255,255,0.8)', padding: '0 2px',
              whiteSpace: 'nowrap',
            }}>{label}</span>
          </div>
        );
      })}

      {/* Live svg-coord readout, floats near the cursor. */}
      {mouseSvg && !anchorForm && (
        <div style={{
          position: 'fixed', zIndex: 5, pointerEvents: 'none',
          left:    `${mouseCss.x + 12}px`,
          top:     `${mouseCss.y + 12}px`,
          fontFamily: 'monospace', fontSize: 11, color: '#234',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #aac',
          padding: '2px 6px', borderRadius: 3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}>
          svg: ({mouseSvg.x.toFixed(2)}, {mouseSvg.y.toFixed(2)})
          {clickMode === 'save' && <span style={{ color: '#88a' }}> · click to label</span>}
        </div>
      )}

      {/* Axis overlay. */}
      {(() => {
        const svgToCss = (sx, sy) => ({
          x: winSize.w / 2 + (sx - ctx.ref.x) * cssScale,
          y: winSize.h / 2 + (sy - ctx.ref.y) * cssScale,
        });
        const origin = svgToCss(0, 0);
        const xEnd   = svgToCss(ctx.viewBoxW, 0);
        const yEnd   = svgToCss(0, ctx.viewBoxH);
        const axisColor = 'rgba(0, 120, 200, 0.7)';
        const tickLabelStyle = {
          position: 'fixed', zIndex: 4, pointerEvents: 'none',
          fontFamily: 'monospace', fontSize: 9,
          color: 'rgba(0, 90, 150, 0.9)',
          background: 'rgba(255,255,255,0.7)', padding: '0 2px',
        };
        const tickStep = ctx.viewBoxW > 200 ? 50 : 10;
        const ticks = [];
        for (let v = 0; v <= ctx.viewBoxW; v += tickStep) {
          const p = svgToCss(v, 0);
          ticks.push(
            <div key={`tx${v}`} style={{
              position: 'fixed', zIndex: 4, pointerEvents: 'none',
              left: `${p.x - 0.5}px`, top: `${p.y - 3}px`,
              width: '1px', height: '6px', background: axisColor,
            }}/>,
            <div key={`txL${v}`} style={{
              ...tickLabelStyle,
              left: `${p.x - 9}px`, top: `${p.y - 14}px`,
            }}>{v}</div>
          );
        }
        for (let v = 0; v <= ctx.viewBoxH; v += tickStep) {
          const p = svgToCss(0, v);
          ticks.push(
            <div key={`ty${v}`} style={{
              position: 'fixed', zIndex: 4, pointerEvents: 'none',
              left: `${p.x - 3}px`, top: `${p.y - 0.5}px`,
              width: '6px', height: '1px', background: axisColor,
            }}/>,
            <div key={`tyL${v}`} style={{
              ...tickLabelStyle,
              left: `${p.x - 26}px`, top: `${p.y - 5}px`,
            }}>{v}</div>
          );
        }
        return (
          <>
            <div style={{
              position: 'fixed', zIndex: 4, pointerEvents: 'none',
              left: `${origin.x}px`, top: `${origin.y - 0.5}px`,
              width: `${xEnd.x - origin.x}px`, height: '1px',
              background: axisColor,
            }}/>
            <div style={{
              position: 'fixed', zIndex: 4, pointerEvents: 'none',
              left: `${origin.x - 0.5}px`, top: `${origin.y}px`,
              width: '1px', height: `${yEnd.y - origin.y}px`,
              background: axisColor,
            }}/>
            <div style={{
              ...tickLabelStyle,
              left: `${origin.x - 26}px`, top: `${origin.y - 14}px`,
              color: 'rgba(0, 90, 150, 1)', fontWeight: 'bold',
            }}>0,0</div>
            {ticks}
          </>
        );
      })()}

      {/* Rule lines (drawn on top of the reference image for visibility). */}
      {[
        { y: ctx.rule.yTop,    label: 'rule.y-top'    },
        { y: ctx.rule.yCenter, label: 'rule.y-center' },
        { y: ctx.rule.yBottom, label: 'rule.y-bottom' },
      ].map(({ y, label }) => {
        const topPx = winSize.h / 2 + (y - ctx.ref.y) * cssScale;
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
