import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { ClassesGallery } from "@/components/landing/ClassesGallery";
import { Horarios } from "@/components/landing/Horarios";
import { ExperienceClass } from "@/components/landing/ExperienceClass";
import { CommunityMoments } from "@/components/landing/CommunityMoments";
import { FounderSpread } from "@/components/landing/FounderSpread";
import { PlansTeaser } from "@/components/landing/PlansTeaser";
import { ContactFooter } from "@/components/landing/ContactFooter";

export default function Index() {
  return (
    <div className="bg-[#F3EFE9]">
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <ClassesGallery />
        <Horarios />
        <ExperienceClass />
        <CommunityMoments />
        <FounderSpread />
        <PlansTeaser />
        <ContactFooter />
      </main>
    </div>
  );
}
