import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import heroPhoto from "@/assets/varre24/hero-varre24.jpg";

/**
 * Hero como el sitio original (varre24fit.com): foto a pantalla completa con el
 * logo VARRE=24 + "Barre & Pilates" centrado. Sin headline ni CTAs — solo marca.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "12%"]);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[600px] overflow-hidden bg-[#2A211B]">
      <motion.img
        src={heroPhoto}
        alt="VARRE24 — estudio de Barre y Pilates en Nápoles, CDMX"
        style={{ y }}
        className="absolute inset-0 h-[112%] w-full object-cover"
      />
      <div className="absolute inset-0 bg-[#2A211B]/45" />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
      >
        <img
          src="/brand/varre24-logo-cream.svg"
          alt="VARRE24"
          className="w-[min(78vw,540px)] drop-shadow-[0_2px_24px_rgba(20,12,8,0.45)]"
        />
        <span className="mt-5 text-[clamp(0.66rem,1.5vw,0.95rem)] tracking-[0.42em] uppercase text-[#F6F2EB]/85">
          Barre &amp; Pilates
        </span>
      </motion.div>

      {/* scroll cue */}
      <div className="absolute inset-x-0 bottom-9 z-10 flex flex-col items-center gap-2 text-[#F6F2EB]/65">
        <span className="text-[0.58rem] tracking-[0.3em] uppercase">Desliza</span>
        <span className="h-8 w-px bg-[#F6F2EB]/35" />
      </div>
    </section>
  );
}
