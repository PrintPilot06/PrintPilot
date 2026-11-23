export default function PrintPilotLogo({ size = 34, withWordmark = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="pp-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="13" fill="#0C1219" stroke="url(#pp-grad)" strokeWidth="1.4" />
        <path d="M15 34V15h10.2c4.3 0 7 2.4 7 6.2 0 3.9-2.8 6.3-7.2 6.3h-5.1" stroke="url(#pp-grad)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M18 34h9" stroke="#22D3EE" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />
        <circle cx="32.5" cy="32.5" r="3" fill="#22D3EE" />
      </svg>
      {withWordmark && (
        <div className="leading-none">
          <div className="font-heading text-[15px] font-semibold tracking-tight text-foreground">
            Print<span className="text-primary">Pilot</span>
          </div>
          <div className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground/70">
            AI Slicer
          </div>
        </div>
      )}
    </div>
  );
}