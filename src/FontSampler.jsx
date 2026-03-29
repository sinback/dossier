const FONTS = [
  { family: "Caveat", weights: [400, 700], note: "MC — loose, natural, best letter variation" },
  { family: "Architects Daughter", weights: [400], note: "Mentor — precise, architectural" },
  { family: "Patrick Hand", weights: [400], note: "Friendly NPC — warm, approachable" },
  { family: "Kalam", weights: [300, 400, 700], note: "Underground contact — rough, informal" },
];

const SAMPLE = "The kestrel knows more than she lets on. Check the docks after midnight — ask for Brasso.";

export default function FontSampler() {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "#1a1714", color: "#d4c9b8", zIndex: 9999,
      overflowY: "auto", padding: "40px 60px",
      fontFamily: "'EB Garamond', Georgia, serif",
    }}>
      <h1 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 28, fontWeight: 900, color: "#c9a96e",
        marginBottom: 8,
      }}>
        Font Sampler
      </h1>
      <p style={{ fontSize: 13, color: "#5a5040", fontFamily: "'JetBrains Mono', monospace", marginBottom: 32 }}>
        Handwriting fonts for character voices. Close by removing {"<FontSampler />"} from main.jsx.
      </p>

      {FONTS.map(({ family, weights, note }) => (
        <div key={family} style={{
          marginBottom: 36,
          borderBottom: "1px solid #2a2520",
          paddingBottom: 28,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: "#c9a96e", letterSpacing: "0.1em",
            textTransform: "uppercase", marginBottom: 4,
          }}>
            {family}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: "#5a5040", marginBottom: 16,
          }}>
            {note}
          </div>

          {weights.map((weight) => (
            <div key={weight} style={{ marginBottom: 12 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, color: "#3a322a", marginBottom: 4,
              }}>
                weight: {weight}
              </div>
              <div style={{
                fontFamily: `'${family}', cursive`,
                fontWeight: weight,
                fontSize: 22,
                lineHeight: 1.5,
                color: "#d4c9b8",
              }}>
                {SAMPLE}
              </div>
              <div style={{
                fontFamily: `'${family}', cursive`,
                fontWeight: weight,
                fontSize: 16,
                lineHeight: 1.5,
                color: "#9a8e7d",
                marginTop: 4,
              }}>
                {SAMPLE}
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 20, borderTop: "1px solid #2a2520", paddingTop: 28 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: "#c9a96e", letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 16,
        }}>
          Side by side — same text, different characters
        </div>
        {FONTS.map(({ family, note }) => (
          <div key={family} style={{
            fontFamily: `'${family}', cursive`,
            fontSize: 20, lineHeight: 1.6, color: "#d4c9b8",
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3a322a", marginRight: 12 }}>
              {family.padEnd(22)}
            </span>
            I don't trust Greyline Holdings.
          </div>
        ))}
      </div>
    </div>
  );
}
