// Under-construction page. Rendered whenever the sidebar/submenu
// resolves to a route that hasn't been built yet.
export default function Placeholder({ title, section }) {
  return (
    <div className="page">
      <h2 className="page-title" style={{ marginBottom: 6 }}>{title}</h2>
      {section && (
        <p style={{ color: '#8a8474', fontSize: 14, marginTop: 0, marginBottom: 22 }}>
          {section}
        </p>
      )}
      <div className="placeholder-v7">
        <span className="tag">Coming soon</span>
        <h2>{title}</h2>
        <p>This section is part of the CraniaVerse layout and will be wired up to your data soon.</p>
      </div>
    </div>
  )
}
