import { useMemo } from 'react'

/** Ráfaga breve de partículas del color del step al completarlo (P2). */
export function Celebration({ color }: { color: string }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + ((i * 7) % 5) * 0.08
        const dist = 38 + ((i * 13) % 5) * 9
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, size: 4 + (i % 3) * 2, delay: (i % 4) * 30 }
      }),
    [],
  )
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2 z-10" aria-hidden>
      {particles.map((p, i) => (
        <span
          key={i}
          className="sdb-particle absolute rounded-full"
          style={
            {
              width: p.size,
              height: p.size,
              background: i % 3 === 0 ? '#FFC53D' : color,
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
