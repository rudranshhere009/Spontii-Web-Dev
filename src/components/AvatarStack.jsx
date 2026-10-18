export default function AvatarStack({ people, max = 4, size = 28 }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p) => (
        p.avatar ? (
          <img
            key={p.id}
            src={p.avatar}
            alt={p.name}
            title={p.name}
            style={{ width: size, height: size }}
            className="rounded-full border-2 border-surface-2 object-cover"
          />
        ) : (
          <span
            key={p.id}
            role="img"
            aria-label={`${p.name} has no profile photo`}
            title={p.name}
            style={{ width: size, height: size, fontSize: Math.max(12, size * 0.56) }}
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-surface-2 bg-surface-3 leading-none"
          >
            👤
          </span>
        )
      ))}
      {extra > 0 && (
        <span
          style={{ width: size, height: size }}
          className="flex items-center justify-center rounded-full border-2 border-surface-2 bg-surface-3 text-[11px] font-semibold text-muted"
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
