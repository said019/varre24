import { Reveal } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { LANDING_PHOTOS } from "./photoAssets";

export function CommunityMoments() {
  return (
    <section className="bg-[#FCF8F7] px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#9C8A8B]">Inauguracion</p>
          <h2 className="font-bebas mt-3 text-[clamp(2.2rem,5vw,3.6rem)] font-light leading-none tracking-[0.02em] text-[#1A060B]">
            Comunidad VARRE24
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          {LANDING_PHOTOS.community.map((photo, index) => (
            <Reveal
              key={photo.src}
              delay={index * 0.04}
              className={cn(
                "overflow-hidden rounded-[6px] bg-[#E8D7D6]",
                index === 0 && "lg:col-span-7 lg:row-span-2",
                index === 1 && "lg:col-span-5",
                index === 2 && "lg:col-span-2",
                index === 3 && "lg:col-span-3",
              )}
            >
              <img
                src={photo.src}
                alt={photo.alt}
                loading="eager"
                className={cn(
                  "h-full min-h-64 w-full object-cover",
                  index === 0 ? "aspect-[4/3] lg:aspect-auto" : "aspect-[16/10]",
                )}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
