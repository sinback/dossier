import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "./theme.jsx";

// --- Prompt generation from tags ---
const PROMPT_TEMPLATES = {
  // Tag-based analytical prompts
  faction: (name, val) => [
    `What does ${val} actually want from ${name}?`,
    `Is ${name} loyal to ${val}, or just convenient?`,
    `How would ${val} react if ${name} disappeared?`,
    `What's ${name}'s rank within ${val}, really?`,
  ],
  role: (name, val) => [
    `Is "${val}" actually what ${name} does, or a cover?`,
    `Who else does what ${name} does?`,
    `How replaceable is ${name} as a ${val}?`,
  ],
  mood: (name, val) => [
    `Why does ${name} always seem ${val}?`,
    `Is the ${val} thing an act?`,
    `What would make ${name} drop the ${val} mask?`,
  ],
  trait: (name, val) => [
    `Does "${val}" make ${name} useful or dangerous?`,
    `Have I seen ${name}'s "${val}" side slip?`,
    `Who else knows ${name} is ${val}?`,
  ],
  location: (name, val) => [
    `Why does ${name} hang around ${val}?`,
    `What happens at ${val} when ${name} isn't there?`,
    `Who else have I seen at ${val}?`,
  ],
  relationship: (name, val) => [
    `What's the real deal between ${name} and ${val}?`,
    `Would ${name} sell out ${val}?`,
    `Would ${val} sell out ${name}?`,
  ],
  // Universal prompts (no tag needed)
  universal: (name) => [
    `Is ${name} hot?`,
    `Do I trust ${name}?`,
    `What's ${name}'s deal?`,
    `Would I get a drink with ${name}?`,
    `What am I not seeing about ${name}?`,
    `What does ${name} think of me?`,
    `Am I overthinking ${name}?`,
    `If things go south, whose side is ${name} on?`,
    `What would ${name} do if they had my job?`,
    `Gut feeling about ${name}?`,
  ],
  // For faction-type entries
  faction_entry: (name) => [
    `What's ${name}'s real agenda?`,
    `Who actually runs ${name}?`,
    `What would the city look like without ${name}?`,
    `Am I on ${name}'s radar?`,
    `What's ${name}'s weak spot?`,
    `Who in ${name} could I actually talk to?`,
    `Is ${name} growing or dying?`,
  ],
  // For location-type entries
  location_entry: (name) => [
    `What really goes on at ${name}?`,
    `Who controls ${name}?`,
    `Is ${name} safe?`,
    `What's changed about ${name} recently?`,
    `Who have I seen at ${name}?`,
    `What's the vibe at ${name} after dark?`,
    `Why does everyone keep mentioning ${name}?`,
    `What would I miss if ${name} disappeared?`,
  ],
};

function generatePrompts(entry) {
  const prompts = [];
  const name = entry.name;

  // Generate from each tag
  if (entry.tags) {
    for (const [key, value] of Object.entries(entry.tags)) {
      const templateFn = PROMPT_TEMPLATES[key];
      if (templateFn) {
        prompts.push(...templateFn(name, value));
      }
    }
  }

  // Add type-specific universals
  const typeTemplates = {
    faction: "faction_entry",
    location: "location_entry",
  };
  const templateKey = typeTemplates[entry.type];
  if (templateKey && PROMPT_TEMPLATES[templateKey]) {
    prompts.push(...PROMPT_TEMPLATES[templateKey](name));
  } else {
    prompts.push(...PROMPT_TEMPLATES.universal(name));
  }

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
    portraits: ["🐺", "🦊", "🐦", "🐻", "🦎", "🐱", "🐰", "🦉", "🐍", "🦇", "🐸", "🦝"],
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
    name: "Marta Voss",
    type: "npc",
    subtitle: "Mentor / Handler",
    portrait: "🦊",
    tags: {
      role: "fixer",
      faction: "The Dockyards",
      mood: "tired",
      trait: "patient",
      location: "The Russet",
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
      trait: "unpredictable",
      relationship: "Marta Voss",
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
      location: "Canal Street Market",
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
];


// --- Components ---

function PromptInput({ entry, imaginativeMode, onAddEntry }) {
  const { theme, styles } = useTheme();
  const [prompts, setPrompts] = useState([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    const generated = generatePrompts(entry);
    setPrompts(generated);
    setPromptIndex(0);
    setInputValue("");
  }, [entry.id]);

  const cyclePrompt = useCallback(() => {
    setPromptIndex((i) => (i + 1) % prompts.length);
  }, [prompts.length]);

  const handleKeyDown = (e) => {
    if (e.key === "Tab" && !inputValue && imaginativeMode && prompts.length > 0) {
      e.preventDefault();
      setInputValue(prompts[promptIndex]);
    }
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      onAddEntry(inputValue.trim(), imaginativeMode ? currentPrompt : null);
      setInputValue("");
      cyclePrompt();
    }
  };

  const currentPrompt = prompts[promptIndex] || "";

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
          style={styles.cycleBtn}
          onClick={cyclePrompt}
          title="Next prompt"
          onMouseEnter={(e) => (e.target.style.color = theme.colors.accent)}
          onMouseLeave={(e) => (e.target.style.color = theme.colors.textDim)}
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
        }}
      >
        {imaginativeMode ? "tab to accept · enter to save · ↻ cycle" : "enter to save"}
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
export default function Dossier() {
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

        {showAddModal && (
          <AddEntryModal
            onClose={() => setShowAddModal(false)}
            onAdd={addEntry}
          />
        )}
      </div>
  );
}
