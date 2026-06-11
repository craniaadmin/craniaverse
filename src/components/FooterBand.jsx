export default function FooterBand({ label, onClick }) {
  return (
    <div className="footer-band" onClick={onClick} role="button">
      {label}
    </div>
  )
}
