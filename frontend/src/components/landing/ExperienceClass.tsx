import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/lib/motion";
import { EXPERIENCES } from "./data";

export function ExperienceClass() {
  const reduce = useReducedMotion();
  return (
    <section id="experience" className="bg-[#2A211B] px-6 py-20 text-[#F6F2EB] sm:px-10 lg:px-16">
      <Reveal>
        <p className="font-alilato text-xs uppercase tracking-[0.24em] text-[#CBBFAF]">Experience Class</p>
        <h2 className="font-bebas mt-2 text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight">
          NO ES SOLO ENTRENAR
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {EXPERIENCES.map((e) => (
          <motion.div
            key={e.name}
            whileHover={reduce ? undefined : { rotate: -1.5, y: -6 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="rounded-3xl border border-[#CBBFAF]/25 bg-[#3A2F26]/40 p-7"
          >
            <h3 className="font-bebas text-2xl tracking-tight text-[#CBBFAF]">{e.name}</h3>
            <p className="font-alilato mt-2 text-sm opacity-80">{e.note}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
