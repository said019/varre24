import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { LANDING_PHOTOS } from "./photoAssets";

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
    <section ref={ref} className="relative h-[100svh] min-h-[600px] overflow-hidden bg-[#260910]">
      <motion.img
        src={LANDING_PHOTOS.hero.src}
        alt={LANDING_PHOTOS.hero.alt}
        style={{ y }}
        className="absolute inset-0 h-[112%] w-full object-cover object-center"
      />
      {/* Velo vino: la foto respira burgundy, no negro */}
      <div className="absolute inset-0 bg-[#3B0E1A]/55" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(59,14,26,0.32)_72%)]" />

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
        <span className="mt-5 text-[clamp(0.66rem,1.5vw,0.95rem)] tracking-[0.42em] uppercase text-[#F3EFE9]/85">
          Barre &amp; Pilates
        </span>
      </motion.div>

      {/* scroll cue — soft pink */}
      <div className="absolute inset-x-0 bottom-9 z-10 flex flex-col items-center gap-2 text-[#FFD6E6]/90">
        <span className="text-[0.58rem] tracking-[0.3em] uppercase">Desliza</span>
        <span className="h-8 w-px bg-[#FFD6E6]/50" />
      </div>
    </section>
  );
}
