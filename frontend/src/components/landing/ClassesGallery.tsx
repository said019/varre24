import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { CLASSES } from "./data";
import { CLASS_PHOTOS } from "./photoAssets";

/**
 * Lista editorial minimal — sobre crema, separada por hairlines.
 * Cada fila lleva a reservar en el sistema; "Reservar →" aparece en hover.
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
              <Link
                to={c.key === "eventos" ? "/app/eventos" : "/app/classes"}
                className="group grid grid-cols-1 gap-x-6 gap-y-5 rounded-2xl border-b border-[#E8D7D6] px-4 py-8 no-underline transition-colors hover:bg-[#FFE4EE] sm:-mx-4 sm:grid-cols-12 sm:items-center"
              >
                <div className="overflow-hidden rounded-[6px] bg-[#E8D7D6] sm:col-span-3 lg:col-span-2">
                  <img
                    src={CLASS_PHOTOS[c.key].src}
                    alt={CLASS_PHOTOS[c.key].alt}
                    loading="lazy"
                    className="aspect-[4/3] h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                  />
                </div>
                <span className="font-alilato text-[0.7rem] tracking-[0.24em] text-[#9C8A8B] sm:col-span-1 lg:text-center">
                  {c.n}
                </span>
                <h3 className="font-bebas text-[clamp(1.6rem,3vw,2.3rem)] font-light leading-none tracking-[0.01em] text-[#1A060B] sm:col-span-3">
                  {c.name}
                </h3>
                <p className="font-alilato text-sm leading-relaxed text-[#3B0E1A]/85 sm:col-span-3 lg:col-span-4">
                  {c.blurb}
                </p>
                <span className="font-alilato mt-1 inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.18em] text-[#3B0E1A] sm:col-span-2 sm:mt-0 sm:justify-end">
                  Reservar
                  <span className="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
                </span>
              </Link>
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
