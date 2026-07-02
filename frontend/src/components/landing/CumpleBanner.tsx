import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";

/**
 * Banner de eventos privados / cumpleaños — el momento más soft-pink de la
 * landing (paleta MODDO). Lleva a la compra en línea de paquetes (/app/eventos).
 */
export function CumpleBanner() {
  return (
    <section className="bg-[#F3EFE9] px-6 pb-24 sm:px-10 lg:px-16">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#FFD6E6] p-8 sm:p-12 lg:p-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#FFE4EE]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#8A5A5E]">Eventos privados</p>
              <h2 className="font-bebas mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-light leading-[1.12] tracking-[0.01em] text-[#3B0E1A]">
                Celebra tu cumpleaños<br />en VARRE24
              </h2>
              <p className="font-alilato mt-4 max-w-[48ch] text-sm leading-relaxed text-[#3B0E1A]/75">
                El estudio exclusivo para tu grupo: clase privada, música a tu gusto, brindis y fotos. Elige tu paquete y reserva en línea.
              </p>
              <Link
                to="/app/eventos"
                className="press mt-7 inline-flex items-center rounded-full bg-[#3B0E1A] px-8 py-3.5 font-alilato text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-[#FFD6E6] no-underline transition-colors hover:bg-[#320C16]"
              >
                Ver paquetes
              </Link>
            </div>
            <div className="relative z-[1] rounded-2xl border border-[#F5C2D6] bg-[#FCF8F7] p-6 sm:p-7">
              <p className="font-alilato text-sm font-medium text-[#1A060B]">Cumpleaños Deluxe</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="font-bebas text-[2.2rem] font-light leading-none text-[#1A060B]">$5,500</span>
                <span className="font-alilato text-[0.62rem] text-[#9C8A8B]">MXN</span>
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Clase privada temática de 60 min",
                  "Decoración del estudio",
                  "Mesa dulce y brindis",
                  "Hasta 10 invitadas",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 font-alilato text-xs text-[#8A5A5E]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F5C2D6]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
