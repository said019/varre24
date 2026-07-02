import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { Reveal } from "@/lib/motion";
import { FOUNDER } from "./data";
import { FOUNDER_PHOTO } from "./photoAssets";

export function FounderSpread() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", reduce ? "-8%" : "8%"]);

  return (
    <section ref={ref} className="grid items-stretch gap-0 bg-[#3B0E1A] md:grid-cols-2">
      <div className="relative h-[60vh] overflow-hidden md:h-auto md:min-h-[88vh]">
        <motion.img src={FOUNDER_PHOTO.src} alt={FOUNDER_PHOTO.alt} style={{ y }} className="absolute inset-0 h-[120%] w-full object-cover" />
      </div>
      {/* Panel vino con acentos rosa */}
      <Reveal className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-16">
        <p className="font-alilato text-xs uppercase tracking-[0.24em] text-[#FFD6E6]">{FOUNDER.role}</p>
        <h2 className="font-bebas mt-2 text-[clamp(2.4rem,5vw,4.5rem)] leading-none tracking-tight text-[#F3EFE9]">
          {FOUNDER.name}
        </h2>
        <p className="font-editorial mt-6 text-2xl italic text-[#FFD6E6]">“{FOUNDER.quote}”</p>
        <div className="font-alilato mt-6 space-y-4 text-[#F3EFE9]/80">
          {FOUNDER.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </Reveal>
    </section>
  );
}
