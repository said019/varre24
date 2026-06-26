import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { PLANS } from "./data";

export function PlansTeaser() {
  return (
    <section id="planes" className="bg-[#E8DED4] px-6 py-20 sm:px-10 lg:px-16">
      <Reveal>
        <h2 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight text-[#2A211B]">PLANES</h2>
        <p className="font-alilato mt-3 max-w-md text-[#2A211B]/70">Elige cómo quieres moverte. Sin permanencia forzada.</p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((p) => (
          <Reveal key={p.name} className="h-full">
            <div className="flex h-full flex-col justify-between rounded-3xl border border-[#E8DDD5] bg-[#FBF8F4] p-6">
              <div>
                <p className="font-alilato text-xs uppercase tracking-[0.18em] text-[#5B4A3E]">{p.name}</p>
                <p className="font-bebas mt-3 text-4xl tracking-tight text-[#2A211B]">{p.price}</p>
                <p className="font-alilato mt-1 text-sm text-[#2A211B]/60">{p.note}</p>
              </div>
              <Link to="/auth/register" className="press mt-6 inline-flex items-center justify-center rounded-full bg-[#5B4A3E] px-5 py-3 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#F6F2EB]">
                Empezar
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
