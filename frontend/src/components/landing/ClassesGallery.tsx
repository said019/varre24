import { Reveal } from "@/lib/motion";
import { CLASSES, waLink } from "./data";

/**
 * Lista editorial minimal — sobre crema, separada por hairlines.
 * Cada fila es un enlace a WhatsApp; "Reservar →" aparece en hover.
 */
export function ClassesGallery() {
  return (
    <section id="clases" className="bg-[#F3EFE9] px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#9C8A8B]">El estudio</p>
          <h2 className="font-bebas mt-3 text-[clamp(2.2rem,5vw,3.4rem)] font-light tracking-[0.02em] text-[#1A060B]">
            Las clases
          </h2>
        </Reveal>

        <div className="mt-14 border-t border-[#E8D7D6]">
          {CLASSES.map((c) => (
            <Reveal key={c.key}>
              <a
                href={waLink(c.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="group grid grid-cols-1 gap-x-6 gap-y-2 border-b border-[#E8D7D6] py-9 sm:grid-cols-12 sm:items-baseline"
              >
                <span className="font-alilato text-[0.7rem] tracking-[0.24em] text-[#9C8A8B] sm:col-span-1">
                  {c.n}
                </span>
                <h3 className="font-bebas text-[clamp(1.6rem,3vw,2.3rem)] font-light leading-none tracking-[0.01em] text-[#1A060B] sm:col-span-4">
                  {c.name}
                </h3>
                <p className="font-alilato text-sm leading-relaxed text-[#3B0E1A]/85 sm:col-span-5">
                  {c.blurb}
                </p>
                <span className="font-alilato mt-1 inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.18em] text-[#3B0E1A] sm:col-span-2 sm:mt-0 sm:justify-end">
                  Reservar
                  <span className="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
                </span>
              </a>
            </Reveal>
          ))}
        </div>

        <p className="font-alilato mt-8 text-[0.7rem] uppercase tracking-[0.22em] text-[#9C8A8B]">
          Todas las clases · 60 min · cupo 7
        </p>
      </div>
    </section>
  );
}
