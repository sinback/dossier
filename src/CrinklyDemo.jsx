import CrumpledPaperBackground from "./CrumpledPaperBackground";

export default function CrinklyDemo() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#e8e4db",
        padding: 24,
      }}
    >
      <CrumpledPaperBackground width={900} height={500}>
        <div style={{ padding: 40 }}>
          <h1 style={{ marginTop: 0, fontSize: 48 }}>Interactive Paper</h1>
          <p style={{ maxWidth: 600, lineHeight: 1.6, fontSize: 18 }}>
            Click anywhere to add a little more local crumpling.
          </p>
        </div>
      </CrumpledPaperBackground>
    </div>
  );
}
