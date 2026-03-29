import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeProvider, useTheme } from "./styles/theme.jsx";
import PaperCanvasPanel from "./styles/PaperCanvasPanel.jsx";
import { TAG_PROMPTS, UNIVERSAL_PROMPTS } from "./prompts/promptBank.js";

// --- Prompt generation from tags ---

function generatePrompts(entry) {
  const prompts = [];
  const name = entry.name;
  const type = entry.type;

  // Generate from each tag, preferring type-specific templates
  if (entry.tags) {
    for (const [key, value] of Object.entries(entry.tags)) {
      // Skip tags that don't generate prompts
      if (key === "pronouns") continue;

      const typedFn = TAG_PROMPTS[`${key}:${type}`];
      const genericFn = TAG_PROMPTS[key];
      const templateFn = typedFn || genericFn;
      if (templateFn) {
        prompts.push(...templateFn(name, value));
      }
    }
  }

  // Add type-specific universal prompts
  const universalFn = UNIVERSAL_PROMPTS[type] || UNIVERSAL_PROMPTS.npc;
  prompts.push(...universalFn(name));

  // Shuffle
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
  }

  return prompts;
}

// --- Type configuration ---
const ENTRY_TYPES = {
  npc: {
    label: "People",
    singular: "Person",
    portraits: ["🐺", "🦊", "🐦", "🐻", "🦎", "🐱", "🐰", "🦉", "🐍", "🦇", "🐸", "🦝", "🦅", "🐿️"],
    defaultSubtitle: "Unknown",
    placeholders: {
      name: "e.g. Sal Marchetti",
      subtitle: "e.g. Bartender / Informant",
    },
  },
  faction: {
    label: "Factions",
    singular: "Faction",
    portraits: ["⚓", "🔧", "🏗️", "🎭", "⚖️", "🔥", "🛡️", "📦", "💎", "🌿"],
    defaultSubtitle: "Unknown Faction",
    placeholders: {
      name: "e.g. The Lamplighters",
      subtitle: "e.g. Underground Press Network",
    },
  },
  location: {
    label: "Locations",
    singular: "Location",
    portraits: ["🏚️", "🌉", "🏭", "🍺", "⛪", "🚇", "🏢", "🌳", "🔒", "💡"],
    defaultSubtitle: "Unknown Location",
    placeholders: {
      name: "e.g. The Russet",
      subtitle: "e.g. Dive bar, Harbor District",
    },
  },
};

const ENTRY_TYPE_KEYS = Object.keys(ENTRY_TYPES);

// --- Seed data ---
const SEED_DATA = [
  {
    id: "npc-1",
    name: "The Mentor",
    type: "npc",
    subtitle: "Mentor / Handler",
    portrait: "🦅",
    tags: {
      role: "fixer",
      faction: "Aspenwatch",
      mood: "tired",
      trait: "patient",
      location: "The Russet",
      species: "kestrel",
      relationship: "Jack-O",
      pronouns: "she",
    },
    notes: "",
  },
  {
    id: "npc-2",
    name: "Kel Brasso",
    type: "npc",
    subtitle: "Faction Operator",
    portrait: "🐺",
    tags: {
      role: "enforcer",
      faction: "Bridgewater Union",
      mood: "cheerful",
      trait: "thorough",
      relationship: "The Mentor",
      species: "raccoon",
      pronouns: "he",
    },
    notes: "",
  },
  {
    id: "npc-3",
    name: "Dez",
    type: "npc",
    subtitle: "Information Broker",
    portrait: "🐦",
    tags: {
      role: "broker",
      mood: "nervous",
      trait: "well-connected",
      location: "The Heights",
      species: "robin",
      pronouns: "they",
    },
    notes: "",
  },
  {
    id: "npc-4",
    name: "Jack-O",
    type: "npc",
    subtitle: "General Contractor",
    portrait: "🐻",
    tags: {
      faction: "Bridgewater Union",
      species: "squirrel",
      appearance: "eyepatch",
      trait: "jovial",
      role: "fixer_hidden",
    },
    notes: "",
  },
  {
    id: "faction-1",
    name: "The Dockyards",
    type: "faction",
    subtitle: "Shipping & Logistics Syndicate",
    portrait: "⚓",
    tags: {
      location: "Harbor District",
      mood: "pragmatic",
      trait: "old money",
    },
    notes: "",
  },
  {
    id: "faction-2",
    name: "Bridgewater Union",
    type: "faction",
    subtitle: "Labor Coalition / Political Machine",
    portrait: "🔧",
    tags: {
      location: "Midtown",
      mood: "ambitious",
      trait: "populist",
      relationship: "The Dockyards",
    },
    notes: "",
  },
  {
    id: "faction-3",
    name: "Greyline Holdings",
    type: "faction",
    subtitle: "Real Estate & Development",
    portrait: "🏗️",
    tags: {
      location: "The Heights",
      mood: "aggressive",
      trait: "opaque",
    },
    notes: "",
  },
  {
    id: "location-1",
    name: "The Russet",
    type: "location",
    subtitle: "Dive Bar, Harbor District",
    portrait: "🍺",
    tags: {
      faction: "The Dockyards",
      mood: "dim",
      trait: "discreet",
    },
    notes: "",
  },
  {
    id: "location-2",
    name: "Canal Street Market",
    type: "location",
    subtitle: "Open-Air Market, Midtown",
    portrait: "🌉",
    tags: {
      mood: "crowded",
      trait: "neutral ground",
    },
    notes: "",
  },
  {
    id: "location-3",
    name: "My Nest",
    type: "location",
    subtitle: "Good thing I can't smell too good.",
    portrait: "🏚️",
    tags: {
      location: "The Heights",
      vibe: "blighted",
      trait: "safe",
    },
    notes: "",
  },
  {
    id: "location-4",
    name: "The Heights",
    type: "location",
    subtitle: "Old Money",
    portrait: "🏚️",
    tags: {
      faction: "Aspenwatch",
      vibe: "Pando",
      concern: "blight",
    },
    notes: "",
  },
];


// --- Components ---

// --- Sitting budget (player mode prompt rate-limiting) ---
// In player mode, the player sees up to 10 prompts per sitting.
// First 3 are free; after that, cycling is locked (placeholder for
// future pacing logic). Once all 10 are revealed, the player can
// re-cycle through the seen pool freely.

const SITTING_BUDGET = { free: 3, max: 10 };

function getSittingState(sittingKey) {
  const storageKey = `dossier-sitting:${sittingKey || "default"}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { seen: 0 };
}

function setSittingState(sittingKey, state) {
  const storageKey = `dossier-sitting:${sittingKey || "default"}`;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
}

function PromptInput({ entry, imaginativeMode, mode, sittingKey, onAddEntry }) {
  const { theme, styles } = useTheme();
  const [prompts, setPrompts] = useState([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [sittingState, _setSittingState] = useState(() => getSittingState(sittingKey));
  const inputRef = useRef(null);

  const isPlayer = mode === "player";
  const budgetExhausted = isPlayer && sittingState.seen >= SITTING_BUDGET.max;
  const budgetLocked = isPlayer &&
    sittingState.seen >= SITTING_BUDGET.free &&
    sittingState.seen < SITTING_BUDGET.max;

  const updateSitting = useCallback((newState) => {
    _setSittingState(newState);
    setSittingState(sittingKey, newState);
  }, [sittingKey]);

  useEffect(() => {
    const generated = generatePrompts(entry);
    setPrompts(generated);
    setPromptIndex(0);
    setInputValue("");
  }, [entry.id]);

  const cyclePrompt = useCallback(() => {
    if (isPlayer) {
      const next = sittingState.seen + 1;
      if (next > SITTING_BUDGET.max) {
        // Re-cycling through already-seen prompts is free
        setPromptIndex((i) => (i + 1) % Math.min(prompts.length, SITTING_BUDGET.max));
        return;
      }
      updateSitting({ ...sittingState, seen: next });
    }
    setPromptIndex((i) => (i + 1) % prompts.length);
  }, [prompts.length, isPlayer, sittingState, updateSitting]);

  const canCycle = !isPlayer || sittingState.seen < SITTING_BUDGET.free || budgetExhausted;

  const handleKeyDown = (e) => {
    if (e.key === "Tab" && !inputValue && imaginativeMode && prompts.length > 0) {
      e.preventDefault();
      setInputValue(prompts[promptIndex]);
    }
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      onAddEntry(inputValue.trim(), imaginativeMode ? currentPrompt : null);
      setInputValue("");
      if (canCycle) cyclePrompt();
    }
  };

  const currentPrompt = prompts[promptIndex] || "";

  const budgetLabel = isPlayer
    ? `${Math.min(sittingState.seen, SITTING_BUDGET.max)} / ${SITTING_BUDGET.max}`
    : null;

  return (
    <div style={styles.promptBox}>
      {imaginativeMode && !inputValue && (
        <div style={styles.promptGhost}>{currentPrompt}</div>
      )}
      <input
        ref={inputRef}
        type="text"
        style={styles.promptInput(imaginativeMode && !inputValue)}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={!imaginativeMode ? "Add a thought..." : ""}
      />
      {imaginativeMode && (
        <button
          style={{
            ...styles.cycleBtn,
            opacity: canCycle ? 1 : 0.3,
            cursor: canCycle ? "pointer" : "default",
          }}
          onClick={canCycle ? cyclePrompt : undefined}
          title={canCycle ? "Next prompt" : "No more new prompts right now"}
          onMouseEnter={(e) => { if (canCycle) e.target.style.color = theme.colors.accent; }}
          onMouseLeave={(e) => { if (canCycle) e.target.style.color = theme.colors.textDim; }}
        >
          ↻
        </button>
      )}
      <div
        style={{
          fontSize: 10,
          fontFamily: theme.fonts.mono,
          color: theme.colors.border,
          marginTop: 4,
          textAlign: "right",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {budgetLabel && (
            <span style={{ color: budgetLocked ? theme.colors.accent : theme.colors.border }}>
              {budgetLabel}
            </span>
          )}
        </span>
        <span>
          {imaginativeMode ? "tab to accept · enter to save · ↻ cycle" : "enter to save"}
        </span>
      </div>
    </div>
  );
}

function AddEntryModal({ onClose, onAdd }) {
  const { theme, styles } = useTheme();
  const [name, setName] = useState("");
  const [type, setType] = useState("npc");
  const [subtitle, setSubtitle] = useState("");
  const [portrait, setPortrait] = useState("");
  const [tagStr, setTagStr] = useState("");

  const typeConfig = ENTRY_TYPES[type];
  const portraits = typeConfig.portraits;

  const handleAdd = () => {
    if (!name.trim()) return;
    const tags = {};
    tagStr.split(",").forEach((t) => {
      const [k, v] = t.split(":").map((s) => s.trim());
      if (k && v) tags[k] = v;
    });
    onAdd({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      type,
      subtitle: subtitle.trim() || typeConfig.defaultSubtitle,
      portrait: portrait || portraits[0],
      tags,
      notes: "",
    });
    onClose();
  };

  return (
    <div style={styles.modal} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>New Entry</div>

        <label style={styles.modalLabel}>Type</label>
        <select style={styles.modalSelect} value={type} onChange={(e) => { setType(e.target.value); setPortrait(""); }}>
          {ENTRY_TYPE_KEYS.map((key) => (
            <option key={key} value={key}>{ENTRY_TYPES[key].singular}</option>
          ))}
        </select>

        <label style={styles.modalLabel}>Name</label>
        <input
          style={styles.modalInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={typeConfig.placeholders.name}
          autoFocus
        />

        <label style={styles.modalLabel}>Subtitle</label>
        <input
          style={styles.modalInput}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder={typeConfig.placeholders.subtitle}
        />

        <label style={styles.modalLabel}>Portrait</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {portraits.map((p) => (
            <button
              key={p}
              onClick={() => setPortrait(p)}
              style={{
                ...styles.entryPortrait,
                fontSize: 18,
                width: 32,
                height: 32,
                cursor: "pointer",
                border: portrait === p ? `2px solid ${theme.colors.accent}` : "2px solid transparent",
                transition: "border-color 0.15s ease",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <label style={styles.modalLabel}>Tags (key:value, comma-separated)</label>
        <input
          style={styles.modalInput}
          value={tagStr}
          onChange={(e) => setTagStr(e.target.value)}
          placeholder="e.g. faction:Dockyards, role:smuggler, mood:cagey"
        />

        <div style={styles.modalActions}>
          <button style={styles.modalBtn(false)} onClick={onClose}>Cancel</button>
          <button style={styles.modalBtn(true)} onClick={handleAdd}>Add to Dossier</button>
        </div>
      </div>
    </div>
  );
}

// --- Main App ---
export default function Dossier({ mode = "dev", sittingKey } = {}) {
  return (
    <ThemeProvider mode={mode}>
      <DossierInner mode={mode} sittingKey={sittingKey} />
    </ThemeProvider>
  );
}

function DossierInner({ mode, sittingKey }) {
  const { theme, styles } = useTheme();
  const [entries, setEntries] = useState(() => {
    try {
      const stored = localStorage.getItem("dossier-entries");
      return stored ? JSON.parse(stored) : SEED_DATA;
    } catch {
      return SEED_DATA;
    }
  });
  const [selectedId, setSelectedId] = useState(SEED_DATA[0]?.id || null);
  const [filter, setFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [imaginativeMode, setImaginativeMode] = useState(true);
  const [journalEntries, setJournalEntries] = useState(() => {
    try {
      const stored = localStorage.getItem("dossier-journal");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("dossier-entries", JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem("dossier-journal", JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, journalEntries }),
      }).catch(() => {});
    }
  }, [entries, journalEntries]);

  const selected = entries.find((e) => e.id === selectedId);
  const filtered = entries.filter((e) => filter === "all" || e.type === filter);

  const updateNotes = (id, notes) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, notes } : e)));
  };

  const addJournalEntry = (id, text, prompt) => {
    setJournalEntries((prev) => ({
      ...prev,
      [id]: [
        ...(prev[id] || []),
        {
          text,
          prompt: prompt || null,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ],
    }));
  };

  const deleteJournalEntry = (id, index) => {
    setJournalEntries((prev) => ({
      ...prev,
      [id]: prev[id].filter((_, i) => i !== index),
    }));
  };

  const addEntry = (entry) => {
    setEntries((prev) => [...prev, entry]);
    setSelectedId(entry.id);
  };

  const exportData = () => {
    const data = { entries, journalEntries };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `dossier-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h1 style={styles.sidebarTitle}>Dossier</h1>
            <div style={styles.sidebarSubtitle}>Field Intelligence</div>
          </div>

          <div style={styles.filterRow}>
            {["all", ...ENTRY_TYPE_KEYS].map((f) => (
              <button
                key={f}
                style={styles.filterBtn(filter === f)}
                onClick={() => setFilter(f)}
                onMouseEnter={(e) => {
                  if (filter !== f) e.target.style.borderColor = theme.colors.textDim;
                }}
                onMouseLeave={(e) => {
                  if (filter !== f) e.target.style.borderColor = theme.colors.border;
                }}
              >
                {f === "all" ? "All" : ENTRY_TYPES[f].label}
              </button>
            ))}
          </div>

          <div style={styles.entryList}>
            {filtered.map((entry) => (
              <div
                key={entry.id}
                style={styles.entryItem(selectedId === entry.id)}
                onClick={() => setSelectedId(entry.id)}
                onMouseEnter={(e) => {
                  if (selectedId !== entry.id) e.currentTarget.style.background = theme.colors.hover;
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== entry.id) e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={styles.entryPortrait}>{entry.portrait}</div>
                <div>
                  <div style={styles.entryName}>{entry.name}</div>
                  <div style={styles.entrySubtitle}>{entry.subtitle}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            style={styles.addBtn}
            onClick={() => setShowAddModal(true)}
            onMouseEnter={(e) => {
              e.target.style.borderColor = theme.colors.textDim;
              e.target.style.color = theme.colors.text;
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = theme.colors.border;
              e.target.style.color = theme.colors.textMuted;
            }}
          >
            + New Entry
          </button>
        </div>

        {/* Main Panel */}
        <div style={styles.main}>
          {imaginativeMode !== undefined && (
            <div style={styles.settingsBanner}>
              <span style={styles.settingsLabel}>
                {imaginativeMode ? "✦ Imaginative dossier" : "✧ Clean dossier"}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  style={styles.exportBtn}
                  onClick={exportData}
                  title="Export dossier as JSON"
                  onMouseEnter={(e) => (e.target.style.color = theme.colors.accent)}
                  onMouseLeave={(e) => (e.target.style.color = theme.colors.textDim)}
                >
                  ↓ export
                </button>
                <button
                  style={styles.toggle(imaginativeMode)}
                  onClick={() => setImaginativeMode((m) => !m)}
                >
                  <div style={styles.toggleDot(imaginativeMode)} />
                </button>
              </div>
            </div>
          )}

          {selected ? (
            <>
              <div style={styles.mainHeader}>
                <div style={styles.mainPortrait}>{selected.portrait}</div>
                <div style={{ flex: 1 }}>
                  <h2 style={styles.mainName}>{selected.name}</h2>
                  <div style={styles.mainSubtitle}>{selected.subtitle}</div>
                  <div style={styles.tagsRow}>
                    {Object.entries(selected.tags || {}).map(([k, v]) => (
                      <span key={k} style={styles.tag}>
                        <span style={styles.tagKey}>{k}:</span>{" "}
                        <span style={styles.tagValue}>{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={styles.notesSection}>
                <div style={styles.sectionLabel}>Private Notes</div>
                <textarea
                  style={styles.notesArea}
                  value={selected.notes}
                  onChange={(e) => updateNotes(selected.id, e.target.value)}
                  placeholder="Freeform notes..."
                  onFocus={(e) => (e.target.style.borderColor = theme.colors.border)}
                  onBlur={(e) => (e.target.style.borderColor = theme.colors.borderSubtle)}
                />

                <div style={styles.sectionLabel}>Quick Thoughts</div>
                <PromptInput
                  entry={selected}
                  imaginativeMode={imaginativeMode}
                  mode={mode}
                  sittingKey={sittingKey}
                  onAddEntry={(text, prompt) => addJournalEntry(selected.id, text, prompt)}
                />

                {journalEntries[selected.id]?.length > 0 && (
                  <div style={styles.savedEntries}>
                    {[...(journalEntries[selected.id] || [])]
                      .reverse()
                      .map((entry, revIdx) => {
                        const realIdx = journalEntries[selected.id].length - 1 - revIdx;
                        return (
                          <div key={realIdx} style={styles.savedEntry}>
                            <div style={styles.savedTimestamp}>{entry.timestamp}</div>
                            {entry.prompt && (
                              <div style={{
                                fontSize: 12,
                                fontFamily: theme.fonts.mono,
                                color: theme.colors.textDim,
                                fontStyle: "italic",
                                marginBottom: 3,
                              }}>
                                {entry.prompt}
                              </div>
                            )}
                            <div style={styles.savedText}>{entry.text}</div>
                            <button
                              style={styles.deleteEntry}
                              onClick={() => deleteJournalEntry(selected.id, realIdx)}
                              onMouseEnter={(e) => (e.target.style.color = theme.colors.accent)}
                              onMouseLeave={(e) => (e.target.style.color = theme.colors.textFaint)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 32 }}>📁</div>
              <div>Select an entry to view</div>
            </div>
          )}
        </div>

        {/* Paper canvas sandbox — POST to /api/draw to drive it */}
        <div style={{ padding: "24px 24px 0" }}>
          <PaperCanvasPanel width={860} height={220} />
        </div>

        {showAddModal && (
          <AddEntryModal
            onClose={() => setShowAddModal(false)}
            onAdd={addEntry}
          />
        )}
      </div>
  );
}
