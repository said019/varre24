import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { ClassesGallery } from "@/components/landing/ClassesGallery";
import { Horarios } from "@/components/landing/Horarios";
import { ExperienceClass } from "@/components/landing/ExperienceClass";
import { CommunityMoments } from "@/components/landing/CommunityMoments";
import { FounderSpread } from "@/components/landing/FounderSpread";
import { PlansTeaser } from "@/components/landing/PlansTeaser";
import { CumpleBanner } from "@/components/landing/CumpleBanner";
import { ContactFooter } from "@/components/landing/ContactFooter";

const STAFF_ROLES = ["admin", "super_admin", "instructor", "reception"];

export default function Index() {
  const { isAuthenticated, user } = useAuthStore();

  // Acceso directo guardado a pantalla de inicio (PWA standalone): si ya hay
  // sesión, saltar la landing y entrar directo a la app — igual que hace
  // Login.tsx tras autenticarse.
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as any).standalone);
  if (isAuthenticated && isStandalone) {
    const destination = STAFF_ROLES.includes(user?.role ?? "") ? "/admin/dashboard" : "/app";
    return <Navigate to={destination} replace />;
  }

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
        <CumpleBanner />
        <ContactFooter />
      </main>
    </div>
  );
}
