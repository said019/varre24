import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { Reveal } from "@/lib/motion";
import { FOUNDER } from "./data";
import founderPhoto from "@/assets/varre24/hero-about.jpg";

export function FounderSpread() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", reduce ? "-8%" : "8%"]);

  return (
    <section ref={ref} className="grid items-center gap-0 bg-[#F6F2EB] md:grid-cols-2">
      <div className="relative h-[60vh] overflow-hidden md:h-[88vh]">
        <motion.img src={founderPhoto} alt="Alexandra Murillo — Fundadora" style={{ y }} className="absolute inset-0 h-[120%] w-full object-cover" />
      </div>
      <Reveal className="px-6 py-16 sm:px-10 lg:px-16">
        <p className="font-alilato text-xs uppercase tracking-[0.24em] text-[#5B4A3E]">{FOUNDER.role}</p>
        <h2 className="font-bebas mt-2 text-[clamp(2.4rem,5vw,4.5rem)] leading-none tracking-tight text-[#2A211B]">
          {FOUNDER.name}
        </h2>
        <p className="font-editorial mt-6 text-2xl italic text-[#3A2F26]">“{FOUNDER.quote}”</p>
        <div className="font-alilato mt-6 space-y-4 text-[#2A211B]/80">
          {FOUNDER.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </Reveal>
    </section>
  );
}
