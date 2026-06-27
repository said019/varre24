import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { PLANS } from "./data";

export function PlansTeaser() {
  return (
    <section id="planes" className="bg-[#F3EFE9] px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
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
          {PLANS.map((p) => (
            <Reveal key={p.name} className="h-full">
              <div className="flex h-full flex-col justify-between rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-6">
                <div>
                  <p className="font-alilato text-[0.66rem] uppercase tracking-[0.18em] text-[#9C8A8B]">{p.name}</p>
                  <p className="font-bebas mt-3 text-3xl font-light tracking-[0.01em] text-[#1A060B]">{p.price}</p>
                  <p className="font-alilato mt-1 text-sm text-[#3B0E1A]/65">{p.note}</p>
                </div>
                <Link
                  to="/auth/register"
                  className="mt-6 inline-flex items-center justify-center rounded-full border border-[#3B0E1A] px-5 py-2.5 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-[#3B0E1A] transition-colors hover:bg-[#3B0E1A] hover:text-[#F3EFE9]"
                >
                  Empezar
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
