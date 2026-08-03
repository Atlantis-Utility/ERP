interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Tighter bottom margin, for pages that want the content below closer to the title. */
  compact?: boolean;
  /** Overrides the default/compact bottom margin entirely — for pages controlling their own spacing. */
  className?: string;
}

export default function Header({ title, subtitle, actions, compact, className }: HeaderProps) {
  const margin = className ?? (compact ? "mb-3" : "mb-6 md:mb-8");
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${margin}`}>
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-[#0a0a0a]">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[#666] mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
