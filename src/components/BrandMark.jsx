import logo from '../assets/crania-logo.png'

// Crania Schools logo. The source artwork sits on a dark background,
// so we present it on a rounded dark "tile" which reads as an intentional lockup.
export default function BrandMark({ height = 56, radius = 10 }) {
  return (
    <img
      src={logo}
      alt="Crania Schools"
      className="brand-logo"
      style={{ height, borderRadius: radius }}
    />
  )
}
