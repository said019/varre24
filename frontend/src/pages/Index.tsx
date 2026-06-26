import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { ClassesGallery } from "@/components/landing/ClassesGallery";
import { ExperienceClass } from "@/components/landing/ExperienceClass";
import { FounderSpread } from "@/components/landing/FounderSpread";
import { PlansTeaser } from "@/components/landing/PlansTeaser";
import { ContactFooter } from "@/components/landing/ContactFooter";

export default function Index() {
  return (
    <div className="bg-[#F6F2EB]">
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <ClassesGallery />
        <ExperienceClass />
        <FounderSpread />
        <PlansTeaser />
        <ContactFooter />
      </main>
    </div>
  );
}
