import { Reveal } from "@/lib/motion";
import { EXPERIENCES } from "./data";

/**
 * Un único momento oscuro de ritmo — minimal/editorial, celdas con hairlines.
 */
export function ExperienceClass() {
  return (
    <section id="experience" className="bg-[#2A211B] px-6 py-24 text-[#F6F2EB] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#CBBFAF]">Experience Class</p>
          <h2 className="font-bebas mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-light leading-tight tracking-[0.02em]">
            No es solo entrenar
          </h2>
          <p className="font-alilato mt-4 max-w-md text-sm leading-relaxed text-[#F6F2EB]/70">
            Sesiones temáticas que convierten la clase en una experiencia.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#F6F2EB]/12 bg-[#F6F2EB]/12 sm:grid-cols-3">
          {EXPERIENCES.map((e) => (
            <div key={e.name} className="bg-[#2A211B] p-8">
              <h3 className="font-bebas text-xl font-light tracking-[0.04em] text-[#CBBFAF]">{e.name}</h3>
              <p className="font-alilato mt-2 text-sm leading-relaxed text-[#F6F2EB]/65">{e.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
