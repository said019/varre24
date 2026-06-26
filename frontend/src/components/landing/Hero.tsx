import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { KineticHeading, MagneticButton } from "@/lib/motion";
import { waLink, STUDIO } from "./data";
import heroPhoto from "@/assets/varre24/hero-varre24.jpg";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[600px] overflow-hidden bg-[#3A2F26] text-[#F6F2EB]">
      {/* Foto con parallax */}
      <motion.img
        src={heroPhoto}
        alt="Estudio VARRE24"
        style={{ y }}
        className="absolute inset-0 h-[118%] w-full object-cover"
      />
      {/* Overlay espresso — suave arriba (foto respira), oscuro abajo para el texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#2A211B]/85 via-[#2A211B]/28 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-16 sm:px-10 lg:px-16">
        <p className="font-alilato text-[0.72rem] uppercase tracking-[0.28em] text-[#CBBFAF]">
          Estudio boutique · {STUDIO.address.split(",").slice(2, 4).join(",").trim() || "Nápoles, CDMX"}
        </p>
        <h1 className="font-bebas mt-4 text-[clamp(2.4rem,8vw,6rem)] font-light leading-[1.0] tracking-[0.08em]">
          <KineticHeading text="BARRE" /> <br />
          <span className="text-[#CBBFAF]"><KineticHeading text="& PILATES" /></span>
        </h1>
        <p className="font-editorial mt-6 max-w-xl text-lg italic text-[#E8DED4]">
          Movimiento con intención, elegancia y constancia.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <MagneticButton
            href={waLink("una clase")}
            className="press inline-flex items-center rounded-full bg-[#5B4A3E] px-8 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#F6F2EB]"
          >
            Reserva tu clase
          </MagneticButton>
          <MagneticButton
            href="#clases"
            className="press inline-flex items-center rounded-full border border-[#CBBFAF]/40 px-8 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#F6F2EB]"
          >
            Conoce el método
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
