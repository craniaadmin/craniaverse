import logo from '../assets/crania-logo.png'

/* Crania Schools logo.

   `radius` rounds the image itself, which only reads as intentional when
   the artwork is large enough that the corners are empty. On a 22px-tall
   copy a 10px radius took a bite out of the mark, so it defaults to none
   and the caller opts in — the top bar sets its own rounded white tile
   around the logo instead. */
export default function BrandMark({ height = 56, radius = 0 }) {
  return (
    <img
      src={logo}
      alt="Crania Schools"
      className="brand-logo"
      style={{ height, ...(radius ? { borderRadius: radius } : null) }}
    />
  )
}
