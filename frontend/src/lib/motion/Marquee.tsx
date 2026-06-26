interface MarqueeProps {
  items: string[];
  className?: string;
  separator?: string;
}

// Usa el keyframe CSS `scroll-left` + util `.animate-scroll-left` ya definidos en index.css.
export function Marquee({ items, className = "", separator = "·" }: MarqueeProps) {
  const renderTrack = (hidden: boolean) => (
    <div
      className="flex shrink-0 items-center gap-8 pr-8"
      aria-hidden={hidden ? true : undefined}
    >
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-8">
          <span>{it}</span>
          <span className="opacity-50">{separator}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`flex overflow-hidden whitespace-nowrap ${className}`}>
      <div className="flex animate-scroll-left motion-reduce:animate-none">
        {renderTrack(false)}
        {renderTrack(true)}
      </div>
    </div>
  );
}
