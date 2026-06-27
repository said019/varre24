import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { PLANS } from "./data";

export function PlansTeaser() {
  return (
    <section id="planes" className="bg-[#F3EFE9] px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#9C8A8B]">Membresías</p>
          <h2 className="font-bebas mt-3 text-[clamp(2.2rem,5vw,3.4rem)] font-light tracking-[0.02em] text-[#1A060B]">
            Planes
          </h2>
          <p className="font-alilato mt-3 max-w-md text-sm text-[#3B0E1A]/75">
            Elige cómo quieres moverte. Sin permanencia forzada.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => {
            const featured = p.featured;
            return (
              <Reveal key={p.name} className="h-full">
                <div
                  className={[
                    "group flex h-full flex-col rounded-2xl border p-6 transition-all duration-300",
                    featured
                      ? "border-[#3B0E1A] bg-[#3B0E1A] text-[#F3EFE9] shadow-[0_24px_60px_-30px_rgba(59,14,26,0.55)]"
                      : "border-[#E8D7D6] bg-[#FCF8F7] hover:-translate-y-1 hover:border-[#3B0E1A]/35",
                  ].join(" ")}
                >
                  {/* fila reservada para el tag → nombres alineados entre cards */}
                  <div className="mb-3 h-[18px]">
                    {p.tag && (
                      <span
                        className={[
                          "inline-flex rounded-full px-2.5 py-0.5 font-alilato text-[0.56rem] uppercase tracking-[0.16em]",
                          featured ? "bg-[#C9A5A8] text-[#1A060B]" : "bg-[#F4E6EA] text-[#3B0E1A]",
                        ].join(" ")}
                      >
                        {p.tag}
                      </span>
                    )}
                  </div>

                  <p
                    className={[
                      "font-alilato text-[0.66rem] uppercase tracking-[0.18em]",
                      featured ? "text-[#F3EFE9]/60" : "text-[#9C8A8B]",
                    ].join(" ")}
                  >
                    {p.name}
                  </p>

                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span
                      className={[
                        "font-bebas text-[2.1rem] font-light leading-none tracking-[0.01em]",
                        featured ? "text-[#F3EFE9]" : "text-[#1A060B]",
                      ].join(" ")}
                    >
                      {p.price}
                    </span>
                    {p.unit && (
                      <span className={featured ? "font-alilato text-[0.62rem] text-[#F3EFE9]/45" : "font-alilato text-[0.62rem] text-[#9C8A8B]"}>
                        {p.unit}
                      </span>
                    )}
                  </div>

                  <p className={featured ? "mt-2 font-alilato text-sm text-[#F3EFE9]/85" : "mt-2 font-alilato text-sm text-[#1A060B]"}>
                    {p.note}
                  </p>

                  <div className={featured ? "mt-4 border-t border-[#F3EFE9]/15 pt-4" : "mt-4 border-t border-[#E8D7D6] pt-4"}>
                    <p className={featured ? "font-alilato text-xs leading-relaxed text-[#F3EFE9]/65" : "font-alilato text-xs leading-relaxed text-[#3B0E1A]/60"}>
                      {p.detail}
                    </p>
                  </div>

                  <Link
                    to="/auth/register"
                    className={[
                      "mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 font-alilato text-[0.7rem] font-medium uppercase tracking-[0.14em] transition-colors",
                      featured
                        ? "bg-[#F3EFE9] text-[#3B0E1A] hover:bg-[#EADCDD]"
                        : "border border-[#3B0E1A] text-[#3B0E1A] hover:bg-[#3B0E1A] hover:text-[#F3EFE9]",
                    ].join(" ")}
                  >
                    Empezar
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>

        <p className="mt-8 font-alilato text-[0.7rem] uppercase tracking-[0.22em] text-[#9C8A8B]">
          Precios en MXN · sin permanencia · clases de 60 min
        </p>
      </div>
    </section>
  );
}
