import { Reveal, MagneticButton } from "@/lib/motion";
import { STUDIO } from "./data";

export function ContactFooter() {
  return (
    <footer id="contacto" className="bg-[#260910] px-6 py-16 text-[#F3EFE9] sm:px-10 lg:px-16">
      <Reveal className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#C9A5A8]">Contacto</p>
            <h2 className="font-bebas mt-3 text-[clamp(2rem,4.5vw,3.2rem)] font-light leading-tight tracking-[0.02em]">Ven a VARRE24</h2>
            <p className="font-alilato mt-4 max-w-sm text-sm leading-relaxed text-[#EADCDD]/85">{STUDIO.address}</p>
            <a href={STUDIO.instagramUrl} className="font-alilato mt-2 inline-block text-[#C9A5A8]">{STUDIO.instagram}</a>
            <div className="mt-6">
              <MagneticButton href="/app/classes" className="press inline-flex items-center rounded-full bg-[#3B0E1A] px-7 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#F3EFE9]">
                Reservar clase
              </MagneticButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[#C9A5A8]/20">
            <iframe
              title="Mapa VARRE24 — Nápoles, CDMX"
              src={`https://www.google.com/maps?q=${STUDIO.mapsQuery}&output=embed`}
              className="h-64 w-full md:h-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
        <div className="font-alilato mt-12 flex flex-col items-start justify-between gap-2 border-t border-[#C9A5A8]/15 pt-6 text-xs text-[#EADCDD]/70 sm:flex-row">
          <span>© {new Date().getFullYear()} VARRE24 · Barre &amp; Pilates · CDMX</span>
          <span>Movimiento · Intención · Elegancia · Constancia</span>
        </div>
      </Reveal>
    </footer>
  );
}
