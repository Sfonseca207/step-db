import { useMemo } from 'react'

/** Ráfaga breve de partículas del color del step al completarlo (P2). */
export function Celebration({ color }: { color: string }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + ((i * 7) % 5) * 0.09
        const dist = 56 + ((i * 13) % 6) * 12
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist * 0.75, size: 5 + (i % 3) * 2, delay: (i % 4) * 25 }
      }),
    [],
  )
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2 z-10" aria-hidden>
      {particles.map((p, i) => (
        <span
          key={i}
          className="sdb-particle absolute"
          style={
            {
              width: p.size,
              height: p.size,
              background: i % 4 === 0 ? '#FFC53D' : color,
              borderRadius: i % 3 === 0 ? 2 : 999,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
