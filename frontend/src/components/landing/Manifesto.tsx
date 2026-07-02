import { Marquee } from "@/lib/motion";
import { MANIFESTO } from "./data";

export function Manifesto() {
  return (
    <section className="border-y border-[#F5C2D6] bg-[#FFD6E6] py-5 text-[#3B0E1A]">
      <Marquee
        items={MANIFESTO}
        className="font-bebas text-[clamp(0.95rem,1.8vw,1.4rem)] font-light leading-none tracking-[0.2em]"
      />
    </section>
  );
}
