import { Reveal, MagneticButton } from "@/lib/motion";
import { CLASSES, waLink } from "./data";

const TINTS = ["bg-[#670626] text-[#FFF1F3]", "bg-[#FFF1F3] text-[#2B0911]", "bg-[#FFBDC5] text-[#2B0911]", "bg-[#FFF1F3] text-[#2B0911]", "bg-[#7C0116] text-[#FFF1F3]"];

export function ClassesGallery() {
  return (
    <section id="clases" className="bg-[#FFF1F3]">
      <Reveal className="px-6 pt-20 pb-8 sm:px-10 lg:px-16">
        <h2 className="font-bebas text-[clamp(2.6rem,7vw,6rem)] leading-none tracking-tight text-[#2B0911]">
          LAS CLASES
        </h2>
      </Reveal>
      <div>
        {CLASSES.map((c, i) => (
          <Reveal key={c.key}>
            <article className={`${TINTS[i % TINTS.length]} px-6 py-14 sm:px-10 lg:px-16`}>
              <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="font-alilato text-xs uppercase tracking-[0.24em] opacity-70">{c.n}</span>
                  <h3 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-[0.9] tracking-tight">{c.name}</h3>
                  <p className="font-alilato mt-3 max-w-md opacity-80">{c.blurb}</p>
                  <p className="font-alilato mt-2 text-sm uppercase tracking-[0.18em] opacity-60">60 min · cupo 7</p>
                </div>
                <MagneticButton
                  href={waLink(c.name)}
                  className="press inline-flex w-fit items-center rounded-full border border-current px-7 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em]"
                >
                  Reservar
                </MagneticButton>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
