import { ShieldCheckIcon } from './NavIcons'
export default function PersonCard({ person }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <img src={person.avatar} alt={person.name} className="h-11 w-11 rounded-full object-cover" />
          <div>
            <h4 className="font-bold">{person.name}</h4>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              {person.verified && (
                <span className="flex items-center gap-1 text-mint">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
              {person.reliability != null && (
                <span className="font-medium text-muted">{person.reliability}% reliable</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-muted">{person.bio}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {person.tags.map((t) => (
          <span
            key={t}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
