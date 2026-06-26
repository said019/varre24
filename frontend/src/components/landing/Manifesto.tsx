import { Marquee } from "@/lib/motion";
import { MANIFESTO } from "./data";

export function Manifesto() {
  return (
    <section className="bg-[#5B4A3E] py-6 text-[#F6F2EB]">
      <Marquee
        items={MANIFESTO}
        className="font-bebas text-[clamp(2rem,5vw,4rem)] leading-none tracking-tight"
      />
    </section>
  );
}
