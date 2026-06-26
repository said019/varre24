import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { PLANS } from "./data";

export function PlansTeaser() {
  return (
    <section id="planes" className="bg-[#FFE4E8] px-6 py-20 sm:px-10 lg:px-16">
      <Reveal>
        <h2 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight text-[#2B0911]">PLANES</h2>
        <p className="font-alilato mt-3 max-w-md text-[#2B0911]/70">Elige cómo quieres moverte. Sin permanencia forzada.</p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((p) => (
          <Reveal key={p.name} className="h-full">
            <div className="flex h-full flex-col justify-between rounded-3xl border border-[#F3CCD4] bg-[#FFF7F8] p-6">
              <div>
                <p className="font-alilato text-xs uppercase tracking-[0.18em] text-[#7C0116]">{p.name}</p>
                <p className="font-bebas mt-3 text-4xl tracking-tight text-[#2B0911]">{p.price}</p>
                <p className="font-alilato mt-1 text-sm text-[#2B0911]/60">{p.note}</p>
              </div>
              <Link to="/auth/register" className="press mt-6 inline-flex items-center justify-center rounded-full bg-[#7C0116] px-5 py-3 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]">
                Empezar
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
