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
    <section ref={ref} className="relative h-[100svh] min-h-[600px] overflow-hidden bg-[#670626] text-[#FFF1F3]">
      {/* Foto con parallax */}
      <motion.img
        src={heroPhoto}
        alt="Estudio VARRE24"
        style={{ y }}
        className="absolute inset-0 h-[118%] w-full object-cover"
      />
      {/* Overlay claret */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#670626]/55 via-[#670626]/35 to-[#2B0911]/85" />

      <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-16 sm:px-10 lg:px-16">
        <p className="font-alilato text-[0.72rem] uppercase tracking-[0.28em] text-[#FFBDC5]">
          Estudio boutique · {STUDIO.address.split(",").slice(2, 4).join(",").trim() || "Nápoles, CDMX"}
        </p>
        <h1 className="font-bebas mt-4 text-[clamp(3rem,12vw,10rem)] leading-[0.82] tracking-tight">
          <KineticHeading text="BARRE" /> <br />
          <span className="text-[#FFBDC5]"><KineticHeading text="& PILATES" /></span>
        </h1>
        <p className="font-editorial mt-5 max-w-xl text-lg italic text-[#E8DED4]">
          Movimiento con intención, elegancia y constancia.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <MagneticButton
            href={waLink("una clase")}
            className="press inline-flex items-center rounded-full bg-[#7C0116] px-8 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]"
          >
            Reserva tu clase
          </MagneticButton>
          <MagneticButton
            href="#clases"
            className="press inline-flex items-center rounded-full border border-[#FFBDC5]/40 px-8 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]"
          >
            Conoce el método
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
