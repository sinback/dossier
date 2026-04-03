import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import _MatlackRenderer from './MatlackRenderer.jsx';
import { renderGlyph } from './matlackGlyphs.js';
import { useTheme } from './theme.jsx';
// MatlackRenderer is a JSX module with no .d.ts — cast to avoid prop-type errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MatlackRenderer = _MatlackRenderer as any;

const SUPPORTED_LETTERS = ['a', 'b', 'f'] as const;

const LABEL_OPTIONS = [
  { value: 'red',    label: '🔴 Red'    },
  { value: 'yellow', label: '🟡 Yellow' },
  { value: 'green',  label: '🟢 Green'  },
];

// Default locked offsets per letter, keyed by component name.
// These are the grid-search winners — variations spread around them.
const LOCKED_OFFSETS = {
  a: { downstroke: { dx: 4, dy: 2 } },
  b: { barBowl: { dx: -4, dy: 0 } },
  f: { fatBar: { dx: 8, dy: -10 }, hairline: { dx: 8, dy: -2 } },
};

// Generate 9 candidates with a 3×3 spread of offsets for one component.
// The center cell (index 4) uses the locked defaults.
function makeCandidates(letter: string) {
  const defaults = LOCKED_OFFSETS[letter] ?? {};
  // Pick the first component with an offset to vary
  const componentNames = Object.keys(defaults);
  const varyComponent = componentNames[0]; // vary the primary component
  const base = defaults[varyComponent] ?? { dx: 0, dy: 0 };

  const step = 4; // CSS px per grid step — wide enough to see differences
  const offsets: Array<{dx: number, dy: number}> = [];
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      offsets.push({ dx: base.dx + col * step, dy: base.dy + row * step });
    }
  }

  return offsets.map((offset, index) => ({
    id: `candidate-${index + 1}`,
    title: `Candidate ${index + 1}`,
    renderSpec: {
      kind: 'grid-search',
      overrides: {
        ...defaults,
        [varyComponent]: offset,
      },
    },
    judgment: { label: '', talkAboutLater: false, comment: '' },
  }));
}

async function saveReview(data) {
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

function CandidateCard({ candidate, letter, onChange }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const f = theme.fonts;
  const radioName = `label-${candidate.id}`;

  const handleDraw = useCallback((renderer: any, canvas: HTMLCanvasElement) => {
    renderer.clear();
    renderer.setInkColor(30, 38, 58);
    const dpr = window.devicePixelRatio || 1;
    renderGlyph(letter, renderer, canvas.width / 2, canvas.height / 2, 70, dpr,
      candidate.renderSpec.overrides ?? {});
  }, [letter, candidate.renderSpec]);

  return (
    <article
      aria-labelledby={`heading-${candidate.id}`}
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 id={`heading-${candidate.id}`}
          style={{ fontFamily: f.mono, fontSize: 13, fontWeight: 600, color: c.text, margin: 0 }}>
          {candidate.title}
        </h2>
        <span style={{ fontFamily: f.mono, fontSize: 10, color: c.textMuted }}>
          {candidate.id}
        </span>
      </div>

      {/* Override summary */}
      {candidate.renderSpec.overrides && (
        <div style={{ fontFamily: f.mono, fontSize: 10, color: c.textMuted, lineHeight: 1.6 }}>
          {Object.entries(candidate.renderSpec.overrides).map(([comp, off]: [string, any]) => (
            <div key={comp}>{comp}: dx={off.dx} dy={off.dy}</div>
          ))}
        </div>
      )}

      {/* Canvas thumbnail */}
      <div style={{
        border: `1px solid ${c.borderSubtle}`,
        borderRadius: 6,
        overflow: 'hidden',
        aspectRatio: '1',
        width: '100%',
      }}>
        <MatlackRenderer onDraw={handleDraw} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Judgment radios */}
      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{
          fontFamily: f.mono, fontSize: 10, fontWeight: 500, color: c.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
        }}>
          Judgment
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {LABEL_OPTIONS.map((option) => (
            <label key={option.value}
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                       fontFamily: f.body, fontSize: 13, color: c.text, cursor: 'pointer' }}>
              <input
                type="radio"
                name={radioName}
                value={option.value}
                checked={candidate.judgment.label === option.value}
                onChange={(e) => onChange(candidate.id, { ...candidate.judgment, label: e.target.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Talk about later */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8,
                      fontFamily: f.body, fontSize: 13, color: c.text, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={candidate.judgment.talkAboutLater}
          onChange={(e) => onChange(candidate.id, { ...candidate.judgment, talkAboutLater: e.target.checked })}
        />
        Talk about it later
      </label>

      {/* Comment */}
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontFamily: f.mono, fontSize: 10, color: c.textMuted,
                       textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Comment
        </span>
        <input
          type="text"
          value={candidate.judgment.comment}
          onChange={(e) => onChange(candidate.id, { ...candidate.judgment, comment: e.target.value })}
          placeholder="Optional note"
          maxLength={140}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: c.input, border: `1px solid ${c.borderSubtle}`,
            borderRadius: 4, padding: '6px 10px',
            fontFamily: f.body, fontSize: 13, color: c.text,
            outline: 'none',
          }}
        />
      </label>
    </article>
  );
}

export default function MatlackReviewGrid() {
  const { theme } = useTheme();
  const c = theme.colors;
  const f = theme.fonts;

  const [searchParams] = useSearchParams();
  const rawLetter = searchParams.get('letter');
  const letter = rawLetter && (SUPPORTED_LETTERS as readonly string[]).includes(rawLetter) ? rawLetter : null;

  const [candidates, setCandidates] = useState(() => makeCandidates(letter));
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  if (!letter) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, color: c.text,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: f.mono, fontSize: 14, textAlign: 'center', lineHeight: 2 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: c.accent }}>
            Missing ?letter= parameter
          </p>
          <p>Pick a letter to review:</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
            {SUPPORTED_LETTERS.map((l) => (
              <a key={l} href={`/review?letter=${l}`}
                style={{ color: c.accent, textDecoration: 'underline', fontSize: 16 }}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const summary = useMemo(() => {
    const totals = { red: 0, yellow: 0, green: 0, unjudged: 0, talkAboutLater: 0 };
    for (const candidate of candidates) {
      const { label, talkAboutLater } = candidate.judgment;
      if (!label) totals.unjudged += 1;
      else totals[label] += 1;
      if (talkAboutLater) totals.talkAboutLater += 1;
    }
    return totals;
  }, [candidates]);

  function updateJudgment(candidateId, nextJudgment) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, judgment: nextJudgment } : candidate
      )
    );
  }

  async function saveJudgments() {
    const payload = { savedAt: new Date().toISOString(), letter, candidates };
    try {
      const result = await saveReview(payload);
      if (result.ok) {
        setLastSavedAt(`${payload.savedAt} → reviews/${result.file}`);
      } else {
        setLastSavedAt(`Save failed: ${result.error}`);
      }
    } catch (err) {
      setLastSavedAt(`Save failed: ${err}`);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text }}>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>

        {/* Header */}
        <header style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
          justifyContent: 'space-between', gap: 16, marginBottom: 24,
        }}>
          <div>
            <h1 style={{ fontFamily: f.heading, fontSize: 24, fontWeight: 700,
                         color: c.accent, margin: 0 }}>
              Matlack review grid
            </h1>
            <p style={{ fontFamily: f.mono, fontSize: 11, color: c.textMuted, marginTop: 4 }}>
              3×3 candidate scoring — letter: {letter}
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            {/* Summary pill */}
            <div style={{
              background: c.surface, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: '6px 12px',
              fontFamily: f.mono, fontSize: 12, color: c.textSecondary,
              display: 'flex', gap: 12,
            }}>
              <span>🔴 {summary.red}</span>
              <span>🟡 {summary.yellow}</span>
              <span>🟢 {summary.green}</span>
              <span>⚪ {summary.unjudged}</span>
              <span>💬 {summary.talkAboutLater}</span>
            </div>

            <button
              type="button"
              onClick={saveJudgments}
              style={{
                background: c.accent, border: 'none', borderRadius: 6,
                padding: '7px 16px', fontFamily: f.body, fontSize: 13,
                fontWeight: 600, color: c.bg, cursor: 'pointer',
              }}
            >
              Save JSON
            </button>
          </div>
        </header>

        {lastSavedAt && (
          <p style={{ fontFamily: f.mono, fontSize: 11, color: c.textMuted, marginBottom: 16 }}>
            Saved at {lastSavedAt}
          </p>
        )}

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              letter={letter}
              onChange={updateJudgment}
            />
          ))}
        </div>

      </section>
    </div>
  );
}
