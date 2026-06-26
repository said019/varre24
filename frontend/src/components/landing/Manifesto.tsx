import { Marquee } from "@/lib/motion";
import { MANIFESTO } from "./data";

export function Manifesto() {
  return (
    <section className="bg-[#7C0116] py-6 text-[#FFF1F3]">
      <Marquee
        items={MANIFESTO}
        className="font-bebas text-[clamp(2rem,5vw,4rem)] leading-none tracking-tight"
      />
    </section>
  );
}
