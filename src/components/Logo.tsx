export function Logo({ size = 22, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect x="2" y="3" width="13" height="10" rx="3" fill="#E5484D" />
        <rect x="17" y="11" width="13" height="10" rx="3" fill="#3E63DD" />
        <rect x="6" y="19" width="13" height="10" rx="3" fill="#30A46C" />
      </svg>
      {!compact && 'StepDB'}
    </span>
  )
}
