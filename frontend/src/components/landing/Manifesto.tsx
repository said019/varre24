import { Marquee } from "@/lib/motion";
import { MANIFESTO } from "./data";

export function Manifesto() {
  return (
    <section className="border-y border-[#E8D7D6] bg-[#F3EFE9] py-5 text-[#9C8A8B]">
      <Marquee
        items={MANIFESTO}
        className="font-bebas text-[clamp(0.95rem,1.8vw,1.4rem)] font-light leading-none tracking-[0.2em]"
      />
    </section>
  );
}
