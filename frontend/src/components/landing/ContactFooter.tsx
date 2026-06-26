import { Reveal, MagneticButton } from "@/lib/motion";
import { STUDIO, waLink } from "./data";

export function ContactFooter() {
  return (
    <footer id="contacto" className="bg-[#670626] px-6 py-16 text-[#FFF1F3] sm:px-10 lg:px-16">
      <Reveal className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight">VEN A VARRE24</h2>
            <p className="font-alilato mt-4 max-w-sm text-[#E8DED4]">{STUDIO.address}</p>
            <a href={STUDIO.instagramUrl} className="font-alilato mt-2 inline-block text-[#FFBDC5]">{STUDIO.instagram}</a>
            <div className="mt-6">
              <MagneticButton href={waLink("una clase")} className="press inline-flex items-center rounded-full bg-[#7C0116] px-7 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#FFF1F3]">
                Reservar por WhatsApp
              </MagneticButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[#FFBDC5]/20">
            <iframe
              title="Mapa VARRE24 — Nápoles, CDMX"
              src={`https://www.google.com/maps?q=${STUDIO.mapsQuery}&output=embed`}
              className="h-64 w-full md:h-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
        <div className="font-alilato mt-12 flex flex-col items-start justify-between gap-2 border-t border-[#FFBDC5]/15 pt-6 text-xs text-[#E8DED4]/70 sm:flex-row">
          <span>© {new Date().getFullYear()} VARRE24 · Barre &amp; Pilates · CDMX</span>
          <span>Movimiento · Intención · Elegancia · Constancia</span>
        </div>
      </Reveal>
    </footer>
  );
}
