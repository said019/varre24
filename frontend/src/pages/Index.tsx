import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import Schedule from "@/components/Schedule";
import { Dumbbell, Music, Waves, Flame, Zap, Heart, Activity, Sparkles, Flower2, Clock, type LucideIcon, ChevronLeft, ChevronRight, MapPin, Mail, Phone, ArrowUpRight, Menu, X } from "lucide-react";
import pilatesRoomLogo from "@/assets/pilates-room-logo.png";
import imgPilates from "@/assets/pilates-tower_1850574.png";
import heroPhoto from "@/assets/pilates-room-images/index-hero.webp";
import heroPhotoMobile from "@/assets/pilates-room-images/index-hero-coaches-mobile.jpeg";
import studioPhoto from "@/assets/pilates-room-images/studio.webp";
import classPhoto from "@/assets/pilates-room-images/class-group.webp";

/* ───── Types ───── */
type ClassTypeRow = {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  category: "pilates" | "mixto" | "funcional";
  intensity: "ligera" | "media" | "pesada" | "todas";
  color: string;
  emoji: string;
  level: string;
  duration_min: number;
  capacity: number;
  is_active: boolean;
  sort_order: number;
};

type InstructorRow = {
  id: string;
  displayName: string;
  bio: string | null;
  specialties: string[] | string | null;
  photoUrl: string | null;
  photoFocusX: number | null;
  photoFocusY: number | null;
};

type PackageRow = {
  id: string;
  name: string;
  num_classes: string;
  price: number;
  discount_price?: number;
  category: "basico" | "complemento";
  validity_days: number;
  is_active: boolean;
  sort_order: number;
};

/* ───── Fallbacks — datos oficiales Pilates Room @ Centro Oils&Love ───── */
const FALLBACK_CLASS_TYPES: ClassTypeRow[] = [
  {
    id: "reformer",
    name: "Pilates Reformer",
    subtitle: "Bajo impacto · 50 min",
    description: "Fortalece todo tu cuerpo y mente con nuestras clases personalizadas de 50 min de Pilates Reformer. Son de bajo impacto articular gracias a las resistencias ajustables de la máquina, sin olvidarnos de una relajación final.",
    category: "pilates", intensity: "media",
    color: "#836A5D", emoji: "waves",
    level: "Todos los niveles", duration_min: 50, capacity: 7,
    is_active: true, sort_order: 1,
  },
];

/* Beneficios mostrados en la sección de clase (extraídos del material del cliente) */
const REFORMER_BENEFITS = [
  { title: "Mejora postura, flexibilidad y fuerza", icon: "activity" as const },
  { title: "Fortalecimiento del core", desc: "Activa abdominales, espalda y glúteos, mejorando la estabilidad.", icon: "flame" as const },
  { title: "Mejora postural", desc: "Ayuda a alinear el cuerpo y corregir desequilibrios.", icon: "waves" as const },
  { title: "Recuperación segura", desc: "El soporte de la máquina permite trabajar de forma segura, ideal para recuperarse de lesiones.", icon: "heart" as const },
];

const FALLBACK_PACKAGES: PackageRow[] = [
  { id: "p0", name: "Clase de prueba",  num_classes: "1",  price: 200,  category: "basico", validity_days: 7,  is_active: true, sort_order: 0 },
  { id: "p1", name: "4 clases",         num_classes: "4",  price: 860,  category: "basico", validity_days: 30, is_active: true, sort_order: 1 },
  { id: "p2", name: "8 clases",         num_classes: "8",  price: 1410, category: "basico", validity_days: 30, is_active: true, sort_order: 2 },
  { id: "p3", name: "10 clases",        num_classes: "10", price: 1590, category: "basico", validity_days: 30, is_active: true, sort_order: 3 },
  { id: "p4", name: "12 clases",        num_classes: "12", price: 1790, category: "basico", validity_days: 30, is_active: true, sort_order: 4 },
  { id: "p5", name: "16 clases",        num_classes: "16", price: 2040, category: "basico", validity_days: 30, is_active: true, sort_order: 5 },
  { id: "p6", name: "20 clases",        num_classes: "20", price: 2190, category: "basico", validity_days: 30, is_active: true, sort_order: 6 },
];


/* ───── Helpers ───── */
const ICON_MAP: Record<string, LucideIcon> = {
  dumbbell: Dumbbell, music: Music, waves: Waves, flame: Flame,
  zap: Zap, heart: Heart, activity: Activity, sparkles: Sparkles,
  flower2: Flower2,
};
function getCardIcon(emoji?: string, title?: string): LucideIcon {
  if (emoji && ICON_MAP[emoji]) return ICON_MAP[emoji];
  const t = (title || "").toLowerCase();
  if (t.includes("yoga") || t.includes("mindful") || t.includes("meditation")) return Flower2;
  if (t.includes("fitness") || t.includes("tone") || t.includes("strong") || t.includes("body")) return Dumbbell;
  if (t.includes("dance") || t.includes("music")) return Music;
  if (t.includes("pilates") || t.includes("flow") || t.includes("flex")) return Waves;
  if (t.includes("hot") || t.includes("burn")) return Flame;
  if (t.includes("terapéutico") || t.includes("terapeutico")) return Heart;
  return Activity;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ───── Magnetic CTA — atractor sutil al hover (Emil-style) ───── */
function useMagnetic<T extends HTMLElement>(strength = 0.25) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
    };
    const onLeave = () => {
      el.style.transform = "translate3d(0, 0, 0)";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [strength]);
  return ref;
}

/* ───── Founding members — Socias Fundadoras (vigente al 15 de mayo) ───── */
const FOUNDING_DEADLINE = new Date("2026-05-15T23:59:59-06:00");

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return { days, hours, mins, secs, expired: diff === 0 };
}

const FoundingMembersBlock = ({ onCta }: { onCta: () => void }) => {
  const { days, hours, mins, secs, expired } = useCountdown(FOUNDING_DEADLINE);
  if (expired) return null;
  return (
    <div className="reveal opacity-0 translate-y-10 transition-all duration-700 mt-14">
      <div className="relative overflow-hidden rounded-[28px] bg-mesh-dark text-white p-7 sm:p-10 lg:p-12 ring-spotlight">
        {/* Glow ambiental */}
        <div className="absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,#C8B79E_0%,transparent_65%)] opacity-20 pointer-events-none animate-mesh" />
        <div className="absolute -bottom-32 -left-20 w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,#836A5D_0%,transparent_70%)] opacity-30 pointer-events-none animate-mesh" style={{ animationDelay: "8s" }} />

        {/* Sello flotante con el icono de la marca */}
        <div className="absolute top-7 right-7 z-10 hidden sm:flex h-14 w-14 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm items-center justify-center shadow-glow">
          <img src={imgPilates} alt="" className="h-8 w-8 object-contain brightness-0 invert opacity-90" />
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Lado izq: identidad + countdown */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 mb-7">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#C8B79E] animate-ring-pulse" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C8B79E]" />
              </span>
              <span className="text-[0.66rem] tracking-[0.22em] uppercase text-white/85 font-semibold">
                Edición limitada · al 15 de mayo
              </span>
            </div>

            <h3 className="font-bebas text-[clamp(2.4rem,5.5vw,5.5rem)] leading-[0.88] tracking-tight mb-5">
              Socias
              <span className="block font-editorial italic font-light text-[#C8B79E] normal-case">
                fundadoras.
              </span>
            </h3>

            <p className="text-[1.02rem] text-white/75 leading-[1.7] font-alilato mb-8 max-w-[40ch]">
              Una membresía única para quienes nos acompañan desde el inicio. Beneficios exclusivos por todo 2026 y 2027.
            </p>

            {/* Countdown */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md tabular">
              {([
                { v: days,  l: "días" },
                { v: hours, l: "horas" },
                { v: mins,  l: "min" },
                { v: secs,  l: "seg" },
              ] as const).map((u) => (
                <div key={u.l} className="rounded-xl bg-white/5 border border-white/10 p-3 sm:p-4 text-center backdrop-blur-sm">
                  <div className="font-bebas text-[1.8rem] sm:text-[2.4rem] leading-none text-white">
                    {String(u.v).padStart(2, "0")}
                  </div>
                  <div className="text-[0.6rem] tracking-[0.22em] uppercase text-white/45 mt-1.5">
                    {u.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lado der: beneficios + CTA */}
          <div className="lg:col-span-5">
            <p className="text-[0.66rem] tracking-[0.22em] uppercase text-white/45 font-semibold mb-5">
              Lo que incluye
            </p>
            <ul className="flex flex-col gap-4 list-none p-0 m-0 mb-8 stagger">
              {[
                "Tarifa preferencial 2026 y 2027.",
                "Inscripción gratis durante todo 2026.",
                "Beneficios y sorpresas exclusivas a lo largo del año.",
                "Lugar reservado en agenda de clases.",
              ].map((b, i) => (
                <li key={i} className="flex items-start gap-3.5">
                  <span className="mt-[7px] w-5 h-px bg-[#C8B79E] flex-shrink-0" />
                  <span className="text-[0.95rem] text-white/85 leading-[1.55] font-alilato">{b}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={onCta}
              className="press group w-full sm:w-auto px-8 py-4 rounded-full bg-white text-[#4A3329] text-[0.78rem] font-semibold tracking-[0.16em] uppercase inline-flex items-center justify-center gap-2.5 hover:bg-[#C8B79E] hover:text-white transition-colors duration-300"
            >
              Reservar mi lugar
              <ArrowUpRight size={15} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
            <p className="text-[0.72rem] text-white/40 mt-4 font-alilato">
              Sin compromiso anual · Cancelable en cualquier momento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   INDEX — Pilates Room · Movimiento con propósito
   ═══════════════════════════════════════════════════════════ */
const Index = () => {
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroCtaRef = useMagnetic<HTMLButtonElement>(0.18);
  const [classTypes, setClassTypes] = useState<ClassTypeRow[]>(FALLBACK_CLASS_TYPES);
  const [packages, setPackages] = useState<PackageRow[]>(FALLBACK_PACKAGES);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const isAdminRole = ["admin", "super_admin", "instructor", "reception"].includes(user?.role ?? "");
  const membershipCtaPath = isAuthenticated
    ? (isAdminRole ? "/admin/dashboard" : "/app/checkout")
    : "/auth/register";

  /* ── Effects ── */
  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // /class-types es público (sin auth). /admin/class-types da 401 si no hay sesión.
    api.get<{ data: ClassTypeRow[] }>("/class-types").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data.filter((c: any) => c.is_active) : [];
      if (rows.length > 0) setClassTypes(rows);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    api.get<{ data: PackageRow[] }>("/packages").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data : [];
      if (rows.length > 0) setPackages(rows);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    api.get<{ data: InstructorRow[] }>("/public/instructors").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data : [];
      setInstructors(rows);
    }).catch(() => { });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("opacity-100", "translate-y-0");
            entry.target.classList.remove("opacity-0", "translate-y-10");
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const NAV_ITEMS = [
    { label: "Clases", id: "clases" },
    { label: "El cierre", id: "cierre" },
    { label: "Instructoras", id: "instructoras" },
    { label: "Horario", id: "horario" },
    { label: "Paquetes", id: "membresias" },
    { label: "Contacto", id: "contacto" },
  ];

  const specialtyList = (s: InstructorRow["specialties"]): string[] => {
    if (Array.isArray(s)) return s.filter(Boolean);
    if (typeof s === "string" && s.trim()) {
      try { const p = JSON.parse(s); if (Array.isArray(p)) return p.filter(Boolean); } catch { /* not json */ }
      return s.split(",").map((x) => x.trim()).filter(Boolean);
    }
    return [];
  };
  const initialsOf = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="min-h-screen bg-[#f4f5ef] text-[#2d2d2d]">
      {/* ─────────────────── NAV ─────────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-[100] transition-[background-color,backdrop-filter,box-shadow] duration-500 ${
          navScrolled
            ? "bg-[#FAF3EA]/85 backdrop-blur-2xl shadow-[0_1px_0_hsl(22_25%_70%_/_0.25)]"
            : "bg-transparent backdrop-blur-0"
        }`}
        style={{ willChange: "background-color, backdrop-filter" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 sm:px-8 py-3">
          <a href="#" className="flex items-center" aria-label="Pilates Room - Inicio">
            <img
              src={pilatesRoomLogo}
              alt="Pilates Room"
              className="h-16 sm:h-20 w-auto object-contain"
            />
          </a>

          {/* Desktop Nav */}
          <ul className="hidden lg:flex items-center gap-1 list-none">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => scrollTo(item.id)}
                  className={`nav-link px-4 py-2 text-[0.8rem] font-medium tracking-[0.08em] uppercase bg-transparent border-none cursor-pointer transition-colors ${
                    navScrolled ? "text-[#715B50] hover:text-[#4A3329]" : "text-white/68 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <button
                onClick={() => navigate(["admin", "super_admin", "instructor", "reception"].includes(user.role) ? "/admin/dashboard" : "/app")}
                className="press flex items-center gap-2 bg-[#836A5D] text-white px-5 py-2.5 rounded-full text-[0.8rem] font-medium tracking-wide hover:bg-[#715B50] transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[0.7rem] font-bold uppercase">
                  {user.displayName?.[0] ?? user.email?.[0] ?? "U"}
                </span>
                <span className="truncate max-w-[120px]">
                  {["admin", "super_admin"].includes(user.role) ? "Admin" : user.displayName?.split(" ")[0] ?? "Mi cuenta"}
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/auth/login")}
                  className={`hidden sm:block text-[0.8rem] font-medium tracking-wide transition-colors bg-transparent border-none cursor-pointer px-3 py-2 ${
                    navScrolled ? "text-[#715B50] hover:text-[#2d2d2d]" : "text-white/72 hover:text-white"
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  onClick={() => navigate("/auth/register")}
                  className="press bg-[#836A5D] text-white px-6 py-2.5 rounded-full text-[0.8rem] font-medium tracking-wider hover:bg-[#715B50] transition-colors"
                >
                  Unirse
                </button>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`lg:hidden w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                navScrolled ? "hover:bg-[#836A5D]/10" : "hover:bg-white/10"
              }`}
              aria-label="Abrir menú"
            >
              <Menu size={20} className={navScrolled ? "text-[#715B50]" : "text-white"} />
            </button>
          </div>
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[200] lg:hidden">
            <button
              className="absolute inset-0 bg-[#2d2d2d]/40 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menú"
            />
            <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-[#f4f5ef] shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#836A5D]/15">
                <span className="text-[0.75rem] tracking-widest uppercase text-[#836A5D] font-semibold">Menú</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#836A5D]/10 transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X size={18} className="text-[#715B50]" />
                </button>
              </div>
              <nav className="flex-1 py-4">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollTo(item.id)}
                    className="w-full text-left px-6 py-3.5 text-[0.9rem] font-medium text-[#2d2d2d] hover:bg-[#836A5D]/8 transition-colors bg-transparent border-none cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              {!isAuthenticated && (
                <div className="px-5 py-5 border-t border-[#836A5D]/15 space-y-3">
                  <button
                    onClick={() => { setMobileMenuOpen(false); navigate("/auth/login"); }}
                    className="w-full py-3 rounded-full border border-[#836A5D]/30 text-[#715B50] text-[0.82rem] font-medium tracking-wide hover:bg-[#836A5D]/8 transition-colors"
                  >
                    Iniciar sesión
                  </button>
                  <button
                    onClick={() => { setMobileMenuOpen(false); navigate("/auth/register"); }}
                    className="w-full py-3 rounded-full bg-[#836A5D] text-white text-[0.82rem] font-medium tracking-wide hover:bg-[#6C5147] transition-colors"
                  >
                    Unirse
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ─────────────────── HERO ─────────────────── */}
      <section className="relative min-h-[100dvh] flex items-end overflow-hidden bg-[#4A3329]">
        {/* Mobile: foto vertical del equipo, full width para que entren todas las coaches */}
        <img
          src={heroPhotoMobile}
          alt="Equipo de instructoras de Pilates Room"
          className="absolute inset-x-0 top-[72px] w-full object-contain object-top lg:hidden"
          style={{ height: "auto", aspectRatio: "1038 / 1515" }}
        />
        {/* Desktop: misma imagen en alta resolución, centrada */}
        <img
          src={heroPhoto}
          alt="Equipo de instructoras de Pilates Room"
          className="absolute inset-0 h-full w-full object-cover object-[52%_50%] hidden lg:block"
        />
        {/* Mobile: dejamos respirar la foto y reservamos contraste solo para el bloque de texto */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(74,51,41,0.02)_0%,rgba(74,51,41,0.00)_48%,rgba(74,51,41,0.34)_70%,rgba(74,51,41,0.82)_100%)] lg:hidden" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(74,51,41,0.72)_0%,rgba(74,51,41,0.48)_38%,rgba(74,51,41,0.12)_78%,rgba(74,51,41,0.02)_100%)] hidden lg:block" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgba(200,183,158,0.08),transparent_34%)]" />

        {/* Capas de profundidad: grid sutil sobre imagen */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(35 50% 90% / 1) 1px, transparent 1px)," +
                "linear-gradient(90deg, hsl(35 50% 90% / 1) 1px, transparent 1px)",
              backgroundSize: "80px 80px",
            }}
          />
        </div>

        {/* Eyebrow vertical decorativo, alineado a la izquierda */}
        <div className="hidden lg:flex absolute left-8 top-1/2 -translate-y-1/2 z-10 flex-col items-center gap-4 text-white/55">
          <span className="text-[0.62rem] tracking-[0.4em] uppercase rotate-180" style={{ writingMode: "vertical-rl" }}>
            est. 2024 · GDL
          </span>
          <span className="w-[1px] h-20 bg-white/30" />
        </div>

        {/* Hero content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 pb-20 sm:pb-28 pt-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-3 mb-7 animate-fade-up">
              <span className="text-[0.62rem] tracking-[0.32em] uppercase text-white/55 font-semibold tabular">N°01</span>
              <span className="w-8 h-[1px] bg-white/30" />
              <span className="text-[0.72rem] uppercase tracking-[0.18em] text-white/75 font-medium">
                Centro Oils&amp;Love · Jardines del Country, GDL
              </span>
            </div>

            <h1 className="font-bebas text-[clamp(3.5rem,10vw,8.5rem)] leading-[0.85] tracking-tight text-white mb-7 animate-fade-up delay-200">
              <span className="block">PILATES</span>
              <span className="block text-[#C8B79E] -mt-2">
                REFORMER
                <span className="font-editorial italic font-light text-white/85 text-[0.32em] tracking-normal align-top ml-3 -translate-y-1 inline-block">
                  &mdash; método
                </span>
              </span>
            </h1>

            <p className="font-editorial italic font-light text-[clamp(1.05rem,1.5vw,1.3rem)] text-white/85 leading-[1.55] max-w-xl mb-10 animate-fade-up delay-400">
              Un espacio cercano, pensado para ti, para mover, fortalecer y reconectar contigo. Clases de 50&nbsp;min en grupos de siete, con cierre de relajación.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 animate-fade-up delay-600">
              <button
                ref={heroCtaRef}
                data-magnetic
                onClick={() => navigate("/auth/register")}
                className="press group bg-white text-[#4A3329] px-8 py-4 rounded-full text-[0.82rem] font-semibold tracking-[0.12em] uppercase inline-flex items-center justify-center gap-2.5 hover:bg-[#C8B79E] hover:text-white transition-colors duration-300 shadow-warm"
              >
                Reservar clase de prueba
                <ArrowUpRight size={16} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
              <button
                onClick={() => navigate("/auth/login")}
                className="press px-8 py-4 rounded-full text-[0.82rem] text-white border border-white/25 font-medium tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:bg-white/10 backdrop-blur-sm transition-all duration-300"
              >
                Iniciar sesión
              </button>
            </div>
          </div>
        </div>

        {/* Bottom fade hacia el cream para empalmar con la siguiente sección */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#FAF3EA] via-[#FAF3EA]/35 to-transparent z-10" />
      </section>

      {/* ─────────────────── BENEFICIOS STRIP ─────────────────── */}
      <section className="relative z-20 -mt-16 sm:-mt-20">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          {/* Grid asimétrico: 1 hero card grande + 3 cards laterales */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 stagger">
            {/* Hero card — Postura */}
            <div className="lg:col-span-2 lg:row-span-2 group bg-[#836A5D] text-white rounded-[28px] p-7 sm:p-8 ring-spotlight relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[radial-gradient(circle,#C8B79E_0%,transparent_70%)] opacity-25 pointer-events-none animate-mesh" />
              <div className="relative z-10 flex items-start justify-between gap-4 mb-6">
                <span className="text-[0.62rem] tracking-[0.28em] uppercase text-white/55 font-semibold tabular">N°01 / 04</span>
                <Activity size={22} strokeWidth={1.5} className="text-[#C8B79E]" />
              </div>
              <div className="relative z-10">
                <div className="font-bebas text-[2.6rem] sm:text-[3.1rem] leading-[0.92] mb-2 tracking-tight">
                  POSTURA<span className="font-editorial italic font-light text-[#C8B79E] text-[0.5em] align-super tabular ml-1">+</span>
                </div>
                <p className="font-editorial italic font-light text-[1.05rem] text-white/80 leading-[1.55] max-w-[24ch]">
                  Alineación, conciencia corporal y equilibrio en cada repetición.
                </p>
              </div>
            </div>

            {([
              { num: "02", name: "Core",         Icon: Flame, desc: "Abdomen, espalda y glúteos como una sola unidad de fuerza." },
              { num: "03", name: "Flexibilidad", Icon: Waves, desc: "Movilidad articular trabajada con resistencias progresivas." },
              { num: "04", name: "Recuperación", Icon: Heart, desc: "Bajo impacto: ideal para volver tras una pausa o lesión." },
            ] as const).map((d, i) => (
              <div
                key={d.name}
                className={`group lg:col-span-3 bg-surface rounded-[22px] p-5 sm:p-6 shadow-soft hover:shadow-warm transition-all duration-300 hover:-translate-y-0.5 ${
                  i === 1 ? "lg:col-span-3" : ""
                }`}
              >
                <div className="flex items-start gap-5">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#C8B79E]/15 border border-[#C8B79E]/30 flex-shrink-0 transition-transform group-hover:rotate-[-4deg]">
                    <d.Icon size={20} className="text-[#836A5D]" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-[0.62rem] tracking-[0.22em] uppercase text-[#C8B79E] font-semibold tabular">N°{d.num}</span>
                      <span className="font-bebas text-[1.4rem] sm:text-[1.55rem] leading-none text-[#836A5D] tracking-wide">
                        {d.name}
                      </span>
                    </div>
                    <p className="text-[0.85rem] text-[#715B50] leading-[1.55] font-alilato">{d.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── MANIFIESTO ─────────────────── */}
      <section className="py-28 lg:py-36 px-5 sm:px-8 overflow-hidden">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700 max-w-4xl mx-auto">
          {/* Eyebrow asimétrico, no centrado */}
          <div className="flex items-center gap-3 mb-8 text-[0.7rem] tracking-[0.24em] uppercase text-[#836A5D] font-semibold">
            <span className="tabular">N°02</span>
            <span className="w-10 h-[1px] bg-[#836A5D]/40" />
            Nuestro espíritu
          </div>

          <h2 className="font-bebas text-[clamp(2.8rem,5.5vw,5.5rem)] leading-[0.92] text-[#4A3329] mb-10 tracking-tight">
            Un lugar donde otros
            <span className="block font-editorial italic font-light text-[#836A5D] tracking-tight normal-case">
              roles se quedan afuera.
            </span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            <p className="lg:col-span-7 text-[1.1rem] text-[#715B50] leading-[1.75] font-alilato">
              Aquí cada persona se desafía, avanza y disfruta su proceso. Un espacio donde, durante 50 minutos, eres solo tú: sin tareas pendientes, sin etiquetas, sin prisa. Un momento para ti, para conectar con tu cuerpo y volver a tu centro.
            </p>

            <blockquote className="lg:col-span-5 relative pl-6 border-l-2 border-[#C8B79E]">
              <p className="font-editorial italic font-light text-[1.15rem] text-[#4A3329]/85 leading-[1.65]">
                Trabajamos con energía y constancia, desde el respeto por cada cuerpo y cada etapa.
              </p>
              <footer className="text-[0.72rem] text-[#836A5D] mt-4 tracking-[0.2em] uppercase font-semibold">
                — Pilates Room
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ─────────────────── EL ESPACIO ─────────────────── */}
      <section id="espacio" className="py-20 lg:py-28 px-5 sm:px-8 bg-surface">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-14">
            <div>
              <div className="flex items-center gap-3 mb-4 text-[0.7rem] tracking-[0.24em] uppercase text-[#836A5D] font-semibold">
                <span className="tabular">N°02</span>
                <span className="w-10 h-[1px] bg-[#836A5D]/40" />
                El estudio
              </div>
              <h2 className="font-bebas text-[clamp(2.8rem,5vw,5rem)] leading-[0.92] text-[#4A3329] tracking-tight">
                Nuestro
                <span className="block font-editorial italic font-light text-[#836A5D] normal-case">espacio.</span>
              </h2>
            </div>
            <p className="text-[0.95rem] text-[#715B50] max-w-[400px] leading-[1.75] font-alilato">
              Un espacio seguro y acogedor, pensado para que te sientas cómoda, acompañada y en confianza.
            </p>
          </div>

          {/* Stats / mock data del estudio */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 stagger">
            {([
              { num: "07", label: "Alumnas por clase",        sub: "atención personalizada" },
              { num: "50", label: "Min. por sesión",          sub: "movimiento + cierre" },
              { num: "12", label: "Horarios semanales",       sub: "lun a domingo" },
              { num: "10+", label: "Edad mínima Kids",        sub: "con un adulto" },
            ] as const).map((s) => (
              <div key={s.label} className="hoverlift rounded-[20px] bg-mesh-warm ring-spotlight p-7 relative overflow-hidden">
                <div className="absolute top-4 right-4 font-editorial italic font-light text-[#836A5D]/35 text-[0.78rem] tabular">
                  dato
                </div>
                <div className="font-bebas text-[clamp(3rem,5vw,4.5rem)] leading-[0.85] text-[#836A5D] tabular tracking-tight mb-3">
                  {s.num}
                </div>
                <div className="text-[0.78rem] tracking-[0.18em] uppercase text-[#4A3329] font-semibold mb-1">
                  {s.label}
                </div>
                <div className="text-[0.78rem] text-[#715B50] font-alilato">
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <figure className="lg:col-span-8 group relative min-h-[320px] sm:min-h-[420px] overflow-hidden rounded-[26px] bg-[#4A3329]">
              <img
                src={studioPhoto}
                alt="Alumnas entrenando en reformers dentro del estudio"
                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.025]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#4A3329]/72 via-[#4A3329]/12 to-transparent" />
              <figcaption className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                <span className="block text-[0.66rem] tracking-[0.28em] uppercase text-white/65 font-semibold mb-3">
                  Reformer studio
                </span>
                <p className="font-editorial italic font-light text-[1.45rem] sm:text-[2rem] leading-[1.18] text-white max-w-[19ch]">
                  Grupos pequeños, ritmo cuidado y acompañamiento cercano.
                </p>
              </figcaption>
            </figure>

            <div className="lg:col-span-4 grid grid-rows-[1fr_auto] gap-4">
              <figure className="group relative min-h-[260px] overflow-hidden rounded-[26px] bg-[#836A5D]">
                <img
                  src={classPhoto}
                  alt="Clase guiada de Pilates Reformer"
                  className="absolute inset-0 h-full w-full object-cover object-[42%_50%] transition-transform duration-700 ease-out group-hover:scale-[1.035]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#4A3329]/62 via-transparent to-transparent" />
              </figure>

              <div className="rounded-[26px] border border-[#C8B79E]/35 bg-white/72 p-7 sm:p-8">
                <div className="flex items-center gap-3 mb-5 text-[0.68rem] tracking-[0.24em] uppercase text-[#836A5D] font-semibold">
                  <span className="h-2 w-2 rounded-full bg-[#836A5D]" />
                  El ambiente
                </div>
                <p className="font-bebas text-[2rem] leading-[0.95] text-[#4A3329] mb-3">
                  Movimiento con
                  <span className="block font-editorial italic font-light text-[#836A5D] normal-case">
                    propósito.
                  </span>
                </p>
                <p className="text-[0.9rem] text-[#715B50] leading-[1.7] font-alilato">
                  Luz cálida, reformers listos y una clase pensada para que cada repetición se sienta precisa.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── CLASE — Pilates Reformer ─────────────────── */}
      <section id="clases" className="py-20 lg:py-28 px-5 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
            <div className="text-[0.72rem] tracking-[0.18em] uppercase text-[#836A5D] font-semibold mb-4 flex items-center gap-3">
              <span className="w-8 h-[1px] bg-[#836A5D]/40 inline-block" />
              Nuestra clase
            </div>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12">
              <h2 className="font-bebas text-[clamp(2.8rem,4.5vw,4.5rem)] leading-[0.95] text-[#2d2d2d]">PILATES REFORMER</h2>
              <p className="text-[0.9rem] text-[#715B50] max-w-[400px] leading-[1.7] font-alilato">
                Una sola clase, hecha con detalle. Bajo impacto, intención y propósito en cada movimiento.
              </p>
            </div>
          </div>

          {/* Hero card de la clase */}
          {classTypes.slice(0, 1).map((c) => {
            const Icon = getCardIcon(c.emoji, c.name);
            return (
              <div
                key={c.id}
                className="reveal opacity-0 translate-y-10 transition-all duration-700 bg-white rounded-3xl border border-[#e8e9e3] overflow-hidden"
              >
                <div className="p-7 sm:p-10 lg:p-12 flex flex-col gap-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#836A5D]/12 border border-[#836A5D]/25">
                      <Icon size={24} className="text-[#836A5D]" />
                    </div>
                    <span className="px-3 py-1 rounded-full text-[0.65rem] tracking-[0.1em] uppercase font-semibold bg-[#C8B79E]/15 text-[#715B50]">
                      Único método
                    </span>
                    {c.subtitle && (
                      <span className="text-[0.78rem] text-[#836A5D] font-medium">{c.subtitle}</span>
                    )}
                  </div>
                  <p className="text-[1rem] sm:text-[1.05rem] text-[#715B50] leading-[1.85] max-w-3xl font-alilato">
                    {c.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-[0.78rem] text-[#715B50] font-medium pt-5 border-t border-[#e8e9e3]">
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} className="text-[#836A5D]" />
                      {c.duration_min} min
                    </div>
                    <div className="w-1 h-1 rounded-full bg-[#d4d6ce]" />
                    <div>{c.level}</div>
                    <div className="w-1 h-1 rounded-full bg-[#d4d6ce]" />
                    <div>Hasta {c.capacity} personas</div>
                    <div className="w-1 h-1 rounded-full bg-[#d4d6ce]" />
                    <div>Kids 10+ con un adulto</div>
                  </div>
                </div>

                {/* Beneficios */}
                <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-[#e8e9e3]">
                  {REFORMER_BENEFITS.map((b, i) => {
                    const BIcon = ICON_MAP[b.icon] ?? Activity;
                    return (
                      <div
                        key={i}
                        className={`p-6 sm:p-7 ${i % 2 === 1 ? "border-l border-[#e8e9e3]" : ""} ${i >= 2 ? "border-t border-[#e8e9e3] lg:border-t-0 lg:border-l" : ""} ${i === 2 ? "lg:border-l" : ""}`}
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#C8B79E]/15 text-[#836A5D] mb-3">
                          <BIcon size={18} strokeWidth={1.8} />
                        </div>
                        <h4 className="font-alilato font-bold text-[0.92rem] text-[#2d2d2d] mb-1.5 leading-snug">
                          {b.title}
                        </h4>
                        {b.desc && (
                          <p className="text-[0.78rem] text-[#715B50] leading-[1.65] font-alilato">{b.desc}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────────── EL CIERRE — diferenciador ─────────────────── */}
      <section id="cierre" className="relative py-24 lg:py-36 px-5 sm:px-8 overflow-hidden bg-mesh-warm">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          {/* Breathing visual */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <div className="relative aspect-square max-w-md mx-auto">
              {/* Anillos de respiración */}
              <div className="absolute inset-0 rounded-full bg-[#C8B79E]/15 animate-breathe-ring" style={{ animationDelay: "0s" }} />
              <div className="absolute inset-0 rounded-full bg-[#836A5D]/12 animate-breathe-ring" style={{ animationDelay: "1s" }} />
              <div className="absolute inset-0 rounded-full bg-[#836A5D]/10 animate-breathe-ring" style={{ animationDelay: "2s" }} />
              {/* Círculo central que respira */}
              <div
                className="absolute inset-[12%] rounded-full bg-gradient-to-br from-[#C8B79E] to-[#836A5D] animate-breathe shadow-glow"
                style={{ transformOrigin: "center" }}
              />
              {/* Texto centrado, no anima */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <span className="block font-editorial italic font-light text-white/85 text-[0.85rem] tracking-[0.3em] uppercase mb-1">
                    inhala
                  </span>
                  <span className="block w-8 h-[1px] bg-white/40 mx-auto" />
                  <span className="block font-editorial italic font-light text-white/85 text-[0.85rem] tracking-[0.3em] uppercase mt-1">
                    exhala
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Texto editorial */}
          <div className="lg:col-span-7 order-1 lg:order-2 reveal opacity-0 translate-y-10 transition-all duration-700">
            <div className="flex items-center gap-3 mb-7 text-[0.7rem] tracking-[0.24em] uppercase text-[#836A5D] font-semibold">
              <span className="tabular">N°03</span>
              <span className="w-10 h-[1px] bg-[#836A5D]/40" />
              Lo que nos hace únicas
            </div>
            <h2 className="font-bebas text-[clamp(2.6rem,5vw,4.8rem)] leading-[0.92] text-[#4A3329] mb-6 tracking-tight">
              El cierre,
              <span className="block font-editorial italic font-light text-[#836A5D] normal-case">
                un momento para asimilar.
              </span>
            </h2>
            <p className="text-[1.05rem] text-[#715B50] leading-[1.75] font-alilato mb-5 max-w-xl">
              Cada clase termina con un momento dedicado a la relajación: una pausa intencional para que tu cuerpo asimile el trabajo y vuelvas a tu día con calma.
            </p>
            <p className="font-editorial italic font-light text-[1.05rem] text-[#4A3329]/80 leading-[1.65] max-w-lg">
              No es solo entrenar el cuerpo &mdash; es darte espacio para volver a ti.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────── INSTRUCTORAS ─────────────────── */}
      <section id="instructoras" className="py-20 lg:py-28 px-5 sm:px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
            <div className="text-[0.72rem] tracking-[0.18em] uppercase text-[#836A5D] font-semibold mb-4 flex items-center gap-3">
              <span className="w-8 h-[1px] bg-[#836A5D]/40 inline-block" />
              El equipo
            </div>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12">
              <h2 className="font-bebas text-[clamp(2.8rem,4.5vw,4.5rem)] leading-[0.95] text-[#2d2d2d]">
                NUESTRAS
                <span className="block font-editorial italic font-light text-[#836A5D] normal-case">instructoras.</span>
              </h2>
              <p className="text-[0.9rem] text-[#715B50] max-w-[420px] leading-[1.7] font-alilato">
                Quienes te acompañan en cada clase: formación cuidada, trato cercano y la misma intención que define a Pilates Room.
              </p>
            </div>
          </div>

          {/* Grid de instructoras PRIMERO (editable desde Admin → Clases → Instructoras) */}
          {instructors.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 stagger">
              {instructors.map((ins) => {
                const specs = specialtyList(ins.specialties);
                const focusX = ins.photoFocusX ?? 50;
                const focusY = ins.photoFocusY ?? 50;
                return (
                  <article
                    key={ins.id}
                    className="group rounded-[24px] bg-white border border-[#e8e9e3] overflow-hidden hover:border-[#C8B79E]/50 hover:shadow-soft hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="relative aspect-[4/5] bg-[#C8B79E]/15 overflow-hidden">
                      {ins.photoUrl ? (
                        <img
                          src={ins.photoUrl}
                          alt={ins.displayName}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                          style={{ objectPosition: `${focusX}% ${focusY}%` }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#E8D9C5,#C8B79E)]">
                          <span className="font-bebas text-[3.5rem] leading-none text-[#4A3329]/55 tracking-wide">
                            {initialsOf(ins.displayName) || "PR"}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#4A3329]/35 via-transparent to-transparent" />
                    </div>
                    <div className="p-6 sm:p-7">
                      <h3 className="font-bebas text-[1.7rem] leading-none text-[#2d2d2d] tracking-tight">
                        {ins.displayName}
                      </h3>
                      {specs.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {specs.slice(0, 4).map((s) => (
                            <span key={s} className="px-2.5 py-1 rounded-full text-[0.62rem] tracking-[0.06em] uppercase font-semibold bg-[#C8B79E]/15 text-[#715B50]">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                      {ins.bio && (
                        <p className="mt-3 text-[0.85rem] text-[#715B50] leading-[1.65] font-alilato">
                          {ins.bio}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────── HORARIO ─────────────────── */}
      <Schedule />

      {/* ─────────────────── HORARIOS OFICIALES — referencia rápida ─────────────────── */}
      <section className="px-5 sm:px-8 -mt-4 lg:-mt-8 relative z-10">
        <div className="max-w-7xl mx-auto reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="rounded-[24px] bg-mesh-dark text-white p-7 sm:p-9 ring-spotlight relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-[radial-gradient(circle,#C8B79E_0%,transparent_70%)] opacity-20 pointer-events-none" />
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-4">
                <div className="flex items-center gap-3 mb-3 text-[0.66rem] tracking-[0.24em] uppercase text-white/55 font-semibold">
                  <span className="tabular">N°04</span>
                  <span className="w-10 h-[1px] bg-white/30" />
                  Horarios
                </div>
                <h3 className="font-bebas text-[clamp(2rem,3.5vw,3rem)] leading-[0.92] tracking-tight">
                  Clases
                  <span className="block font-editorial italic font-light text-[#C8B79E] normal-case">
                    de 50 min.
                  </span>
                </h3>
                <p className="text-[0.88rem] text-white/60 leading-[1.65] mt-4 font-alilato max-w-[26ch]">
                  Cupos limitados a siete personas por sesión.
                </p>
              </div>

              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-white/10 rounded-2xl overflow-hidden border border-white/10 stagger">
                {([
                  { day: "Lun",     times: ["7:30", "8:30", "18:00", "19:30"] },
                  { day: "Mar",     times: ["8:30", "9:30", "17:00", "18:00", "19:30"] },
                  { day: "Mié",     times: ["7:30", "8:30", "18:00", "19:30"] },
                  { day: "Jue",     times: ["8:30", "9:30", "17:00", "18:00", "19:30"] },
                  { day: "Vie",     times: ["7:30", "8:30"] },
                  { day: "Sáb",     times: ["8:00", "9:15"] },
                  { day: "Dom",     times: ["9:00", "10:00"] },
                ] as const).map((d) => (
                  <div key={d.day} className="bg-[#6C5147] p-4 sm:p-5">
                    <div className="text-[0.62rem] tracking-[0.22em] uppercase text-[#C8B79E] font-semibold mb-3">
                      {d.day}
                    </div>
                    <ul className="flex flex-col gap-1.5 list-none p-0">
                      {d.times.map((t) => (
                        <li key={t} className="font-bebas text-[1.35rem] sm:text-[1.5rem] leading-none text-white tabular tracking-wide">
                          {t}<span className="font-editorial italic font-light text-[0.5em] text-white/45 ml-1">hrs</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── PAQUETES ─────────────────── */}
      <section id="membresias" className="py-20 lg:py-28 px-5 sm:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
            <div className="text-[0.72rem] tracking-[0.18em] uppercase text-[#836A5D] font-semibold mb-4 flex items-center gap-3">
              <span className="w-8 h-[1px] bg-[#836A5D]/40 inline-block" />
              Inversión
            </div>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-14">
              <h2 className="font-bebas text-[clamp(3rem,5.5vw,5.5rem)] leading-[0.92] text-[#4A3329] tracking-tight">
                Elige tu
                <span className="block font-editorial italic font-light text-[#836A5D] normal-case">paquete.</span>
              </h2>
              <p className="text-[0.92rem] text-[#715B50] max-w-[420px] leading-[1.7] font-alilato">
                Vigencia de 30 días desde la primera clase. Pago directo en la app, sin transferencias manuales.
              </p>
            </div>
          </div>

          {/* Clase de prueba */}
          {FALLBACK_PACKAGES.filter((p) => p.num_classes === "1").map((trial) => (
            <div
              key={trial.id}
              className="reveal opacity-0 translate-y-10 transition-all duration-700 rounded-[24px] bg-mesh-warm ring-spotlight mb-10 p-7 sm:p-9 relative overflow-hidden"
            >
              <div className="absolute top-6 right-6 font-editorial italic font-light text-[0.8rem] text-[#836A5D]/40 tabular">
                n°00
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-[#C8B79E]/20 border border-[#C8B79E]/30 flex-shrink-0">
                    <img src={imgPilates} alt="" className="h-7 w-7 object-contain" />
                  </div>
                  <div>
                    <p className="text-[0.66rem] tracking-[0.22em] uppercase text-[#836A5D] font-semibold mb-1">Conoce el método</p>
                    <h3 className="font-bebas text-[1.9rem] leading-none text-[#4A3329] tracking-tight">CLASE DE PRUEBA</h3>
                    <p className="font-editorial italic font-light text-[0.92rem] text-[#715B50] mt-1.5 max-w-md">
                      Una primera clase pensada para que conozcas el espacio, el método y a tu instructora.
                    </p>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 tabular">
                  <span className="font-bebas text-[3rem] leading-none text-[#836A5D]">${Number(trial.price).toLocaleString()}</span>
                  <span className="text-[0.72rem] text-[#715B50]">MXN</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.74rem] text-[#715B50] mb-6 font-alilato">
                <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#836A5D]" />1 clase</span>
                <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#836A5D]" />Para tu primera vez</span>
                <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[#836A5D]" />Reserva en la app</span>
              </div>
              <button
                onClick={() => navigate(membershipCtaPath)}
                className="press w-full sm:w-auto px-8 py-3.5 rounded-full text-[0.76rem] font-semibold tracking-[0.14em] uppercase bg-[#836A5D] text-white hover:bg-[#715B50] transition-colors duration-300 inline-flex items-center justify-center gap-2 group"
              >
                Tomar mi clase de prueba
                <ArrowUpRight size={14} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </div>
          ))}

          {/* Paquetes (4 → 20 clases) */}
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
            <div className="flex items-baseline justify-between mb-7">
              <h3 className="font-alilato font-semibold text-[1.05rem] text-[#4A3329] tracking-tight">
                Paquetes mensuales
              </h3>
              <span className="hidden sm:inline text-[0.7rem] uppercase tracking-[0.2em] text-[#836A5D]/70 tabular">
                {FALLBACK_PACKAGES.filter((p) => p.num_classes !== "1").length} opciones
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {FALLBACK_PACKAGES.filter((p) => p.num_classes !== "1").map((p) => {
                const n = Number(p.num_classes);
                const isPopular = p.num_classes === "12";
                const isBest = p.num_classes === "20";
                const perClass = Math.round(Number(p.price) / n);
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-[24px] p-7 flex flex-col gap-3 transition-all duration-300 ${
                      isBest
                        ? "bg-mesh-dark text-white shadow-glow lg:scale-[1.02]"
                        : isPopular
                          ? "bg-surface ring-spotlight hover:-translate-y-1"
                          : "bg-surface-2 border border-[#e8e9e3] hover:border-[#C8B79E]/50 hover:-translate-y-1 hover:shadow-soft"
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-7 bg-[#C8B79E] text-[#4A3329] text-[0.6rem] tracking-[0.18em] uppercase px-3 py-1 font-semibold whitespace-nowrap">
                        Más popular
                      </div>
                    )}
                    {isBest && (
                      <div className="absolute -top-3 left-7 bg-white text-[#836A5D] text-[0.6rem] tracking-[0.18em] uppercase px-3 py-1 font-semibold whitespace-nowrap">
                        Mejor por clase
                      </div>
                    )}

                    <div className="flex items-start justify-between">
                      <div className={`text-[0.62rem] tracking-[0.22em] uppercase font-semibold ${isBest ? "text-white/55" : "text-[#715B50]/70"}`}>
                        Vigencia 30 días
                      </div>
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                        isBest ? "bg-white/10 border border-white/15" : "bg-[#C8B79E]/15 border border-[#C8B79E]/25"
                      }`}>
                        <img
                          src={imgPilates}
                          alt=""
                          className={`h-6 w-6 object-contain ${isBest ? "brightness-0 invert opacity-90" : ""}`}
                        />
                      </div>
                    </div>

                    <div className={`font-bebas text-[2rem] leading-none tracking-wide ${isBest ? "text-white" : "text-[#4A3329]"}`}>
                      {n} CLASES
                    </div>

                    <div className="flex items-baseline gap-2 mt-1 tabular">
                      <span className={`font-bebas text-[3.4rem] leading-none ${isBest ? "text-white" : "text-[#836A5D]"}`}>
                        ${Number(p.price).toLocaleString()}
                      </span>
                      <span className={`text-[0.7rem] ${isBest ? "text-white/50" : "text-[#715B50]/70"}`}>MXN</span>
                    </div>

                    <div className={`text-[0.78rem] tabular ${isBest ? "text-white/55" : "text-[#715B50]"}`}>
                      ${perClass.toLocaleString()} <span className="opacity-60">/ clase</span>
                    </div>

                    <div className="mt-auto pt-4">
                      <button
                        onClick={() => navigate(membershipCtaPath)}
                        className={`press w-full py-3.5 rounded-full text-[0.76rem] font-semibold tracking-[0.14em] uppercase transition-colors duration-300 cursor-pointer ${
                          isBest
                            ? "bg-white text-[#836A5D] hover:bg-[#C8B79E] hover:text-white"
                            : isPopular
                              ? "bg-[#836A5D] text-white hover:bg-[#715B50]"
                              : "border-2 border-[#836A5D]/80 text-[#836A5D] hover:bg-[#836A5D] hover:text-white hover:border-[#836A5D]"
                        }`}
                      >
                        Elegir paquete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── SOCIAS FUNDADORAS — edición limitada ─── */}
          <FoundingMembersBlock onCta={() => navigate(membershipCtaPath)} />

          {/* Beneficios y notas */}
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700 mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
            <div className="rounded-[18px] border border-[#e8e9e3] bg-surface-2 p-6 hoverlift">
              <p className="text-[0.66rem] tracking-[0.22em] uppercase text-[#836A5D] font-semibold mb-2">Pago</p>
              <p className="text-[0.92rem] text-[#4A3329] font-alilato leading-[1.55]">Tarjeta o transferencia, directo en la app.</p>
            </div>
            <div className="rounded-[18px] border border-[#e8e9e3] bg-surface-2 p-6 hoverlift">
              <p className="text-[0.66rem] tracking-[0.22em] uppercase text-[#836A5D] font-semibold mb-2">Referidas</p>
              <p className="text-[0.92rem] text-[#4A3329] font-alilato leading-[1.55]"><span className="tabular">−10%</span> por cada persona que recomiendes y se inscriba.</p>
            </div>
            <div className="rounded-[18px] border border-[#e8e9e3] bg-surface-2 p-6 hoverlift">
              <p className="text-[0.66rem] tracking-[0.22em] uppercase text-[#836A5D] font-semibold mb-2">Centro Oils&amp;Love</p>
              <p className="text-[0.92rem] text-[#4A3329] font-alilato leading-[1.55]"><span className="tabular">−10%</span> si ya practicas otra disciplina con nosotras.</p>
            </div>
            <div className="rounded-[18px] border border-[#e8e9e3] bg-surface-2 p-6 hoverlift">
              <p className="text-[0.66rem] tracking-[0.22em] uppercase text-[#836A5D] font-semibold mb-2">Kids 10+</p>
              <p className="text-[0.92rem] text-[#4A3329] font-alilato leading-[1.55]">Niñas desde 10 años, acompañadas de un adulto.</p>
            </div>
          </div>

          <p className="text-[0.72rem] text-[#715B50] mt-6 font-alilato tabular">
            Vigencia 30 días desde la primera clase · Precios en MXN · Pago en la app
          </p>
        </div>
      </section>

      {/* ─────────────────── POLÍTICAS ─────────────────── */}
      <section id="politicas" className="py-20 lg:py-28 px-5 sm:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
            <div className="text-[0.72rem] tracking-[0.18em] uppercase text-[#836A5D] font-semibold mb-4 flex items-center gap-3">
              <span className="w-8 h-[1px] bg-[#836A5D]/40 inline-block" />
              Información importante
            </div>
            <h2 className="font-bebas text-[clamp(2.8rem,4.5vw,4.5rem)] leading-[0.95] text-[#2d2d2d] mb-10">
              POLÍTICAS Y REGLAS
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { num: "01", title: "Puntualidad", text: "Llegar a tiempo nos permite preparar tu reformer y ajustar resistencias a tu cuerpo. Hay 10 minutos de tolerancia; pasados, no podemos interrumpir la clase." },
                { num: "02", title: "Cancelación", text: "Cancela con al menos 5 horas de anticipación. Cada mes tienes 2 cancelaciones gratis que devuelven el crédito; después la clase se cuenta como tomada." },
                { num: "03", title: "Reagenda", text: "Tienes 2 reagendas al mes sin costo. La tercera se contabiliza como clase tomada." },
                { num: "04", title: "Clase de prueba", text: "Costo $200, pago en la app. Pensada para ti, si quieres conocer el método y el espacio antes de comprar un paquete." },
                { num: "05", title: "Cupo por clase", text: "Trabajamos en grupos de máximo 7 personas para que cada quien reciba atención personalizada en su movimiento." },
                { num: "06", title: "Vestimenta", text: "Ropa deportiva cómoda y calcetas antideslizantes obligatorias. Llega lista para conectar con tu cuerpo." },
                { num: "07", title: "Pago", text: "Toda compra de paquete o clase se realiza directamente en la app, sin transferencias manuales." },
                { num: "08", title: "Referidos", text: "Por cada persona que recomiendes y tome su primer paquete, recibes −10% en tu siguiente compra." },
              ].map((p) => (
                <div
                  key={p.num}
                  className="rounded-2xl border border-[#e8e9e3] bg-[#f4f5ef] p-5 hover:border-[#C8B79E]/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-all duration-300"
                >
                  <div className="font-bebas text-[2.2rem] text-[#C8B79E]/30 leading-none mb-1">{p.num}</div>
                  <h4 className="font-alilato font-bold text-[0.9rem] text-[#2d2d2d] mb-2">{p.title}</h4>
                  <p className="text-[0.8rem] text-[#715B50] leading-[1.65] font-alilato">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── CTA + CONTACTO ─────────────────── */}
      <section id="contacto" className="py-20 lg:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          {/* CTA Banner */}
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700 mb-20 lg:mb-24">
            <div className="max-w-4xl">
              <div className="flex items-center gap-3 mb-6 text-[0.7rem] tracking-[0.24em] uppercase text-[#836A5D] font-semibold">
                <span className="tabular">N°08</span>
                <span className="w-10 h-[1px] bg-[#836A5D]/40" />
                Tu momento es ahora
              </div>
              <h2 className="font-bebas text-[clamp(3rem,6.5vw,6.5rem)] leading-[0.88] text-[#4A3329] mb-7 tracking-tight">
                ¿Lista para vivir
                <span className="block">
                  <span className="font-editorial italic font-light text-[#836A5D] normal-case">la experiencia</span>
                </span>
                <span className="block text-[#C8B79E]">PILATES ROOM?</span>
              </h2>
              <p className="text-[1.05rem] text-[#715B50] max-w-[540px] mb-10 leading-[1.75] font-alilato">
                Un espacio para tomarte un momento, liberar tensión y salir más fuerte, más tranquila y con energía nueva.
              </p>
              <div className="flex gap-3 items-center flex-wrap">
                <button
                  onClick={() => navigate(membershipCtaPath)}
                  className="press group bg-[#836A5D] text-white px-8 sm:px-10 py-4 rounded-full text-[0.82rem] font-semibold tracking-[0.14em] uppercase inline-flex items-center gap-2.5 hover:bg-[#715B50] hover:shadow-glow transition-all duration-300 cursor-pointer"
                >
                  Reservar clase muestra
                  <ArrowUpRight size={16} strokeWidth={2.5} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
                <a
                  href="https://wa.me/523319070086?text=Hola%2C%20me%20interesa%20conocer%20m%C3%A1s%20sobre%20Pilates%20Room"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Contactar por WhatsApp"
                  className="press border border-[#836A5D]/30 text-[#4A3329] text-[0.82rem] font-medium tracking-[0.14em] uppercase inline-flex items-center gap-2.5 px-8 py-4 rounded-full hover:border-[#836A5D] hover:bg-[#836A5D]/5 transition-all duration-300 no-underline cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.243-1.214l-.257-.154-2.88.856.856-2.88-.154-.257A8 8 0 1 1 12 20z" /></svg>
                  WhatsApp
                </a>
              </div>
            </div>
          </div>

          {/* Contact + Map grid */}
          <div className="reveal opacity-0 translate-y-10 transition-all duration-700 grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Contact card */}
            <div className="rounded-2xl p-8 sm:p-10 flex flex-col justify-between gap-8 bg-[#836A5D] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[250px] h-[250px] rounded-full bg-[radial-gradient(circle,#C8B79E_0%,transparent_65%)] opacity-[0.08] pointer-events-none" />
              <div className="relative z-10">
                <div className="text-[0.7rem] tracking-[0.18em] uppercase text-white/70 font-semibold mb-3">Encuéntranos</div>
                <h3 className="font-bebas text-[clamp(2rem,3vw,3rem)] leading-[0.95] text-white mb-8">
                  VISÍTANOS<br />EN ESTUDIO
                </h3>
                <div className="flex flex-col gap-5">
                  {[
                    { icon: <MapPin size={20} />, label: "Ubicación", value: "Centro Oils&Love · Jardines del Country, Guadalajara", accent: "white" },
                    { icon: <Phone size={20} />, label: "WhatsApp", value: "+52 33 1907 0086", accent: "#C8B79E" },
                    { icon: <Mail size={20} />, label: "Email", value: "pilatesroomoilslove@gmail.com", accent: "white" },
                    { icon: <Clock size={20} />, label: "Horarios", value: "L–J 7:30–20:20 · V 7:30–9:20 · Sáb 8:00–10:05 · Dom 9:00–10:50", accent: "#C8B79E" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 border border-white/15 text-white/80"
                      >
                        {item.icon}
                      </div>
                      <div>
                        <div className="text-[0.65rem] tracking-widest uppercase mb-0.5 text-white/50">{item.label}</div>
                        <div className="text-[0.95rem] text-white font-medium leading-snug">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative z-10 flex flex-col gap-4 pt-6 border-t border-white/15">
                <a
                  href="https://maps.app.goo.gl/qXd1DpwJdTpPeiSP8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-[#715B50] text-[0.82rem] font-semibold tracking-wider uppercase hover:bg-[#f4f5ef] transition-all no-underline w-fit cursor-pointer"
                >
                  <MapPin size={15} />
                  Cómo llegar
                </a>
                <div className="flex gap-2.5">
                  <a
                    href="https://www.instagram.com/centro_oils_and_love/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all no-underline"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>
                  </a>
                  <a
                    href="https://www.facebook.com/pilatesroommx/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all no-underline"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="rounded-2xl overflow-hidden border border-[#e8e9e3] min-h-[450px] lg:min-h-0">
              <iframe
                src="https://www.google.com/maps?q=Centro+Oils+%26+Love&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0, display: "block", minHeight: "450px" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación de Pilates Room Studio en Google Maps"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── FOOTER ─────────────────── */}
      <footer className="bg-[#2d2d2d] text-white px-5 sm:px-8 pt-16 pb-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-white/10">
            {/* Brand */}
            <div>
              <img src={pilatesRoomLogo} alt="Pilates Room" className="h-20 w-auto object-contain mb-4" />
              <p className="text-[0.82rem] text-white/50 leading-[1.7] max-w-[200px] font-alilato">
                Aquí se vive la disciplina, el cuidado del cuerpo y la celebración de cada logro.
              </p>
              <div className="flex gap-2.5 mt-5">
                <a
                  href="https://www.instagram.com/centro_oils_and_love/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:border-[#C8B79E] hover:text-[#C8B79E] transition-colors no-underline"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>
                </a>
                <a
                  href="https://www.facebook.com/pilatesroommx/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/40 hover:border-[#C8B79E] hover:text-[#C8B79E] transition-colors no-underline"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
                </a>
              </div>
            </div>

            {/* Estudio */}
            <div>
              <div className="text-[0.7rem] tracking-[0.15em] uppercase text-white/30 font-semibold mb-5">Estudio</div>
              <ul className="flex flex-col gap-2.5 list-none">
                {[["Clases", "clases"], ["El cierre", "cierre"], ["Instructoras", "instructoras"], ["El estudio", "espacio"], ["Horario", "horario"], ["Paquetes", "membresias"], ["Políticas", "politicas"]].map(([label, id]) => (
                  <li key={id}>
                    <button
                      onClick={() => scrollTo(id)}
                      className="text-[0.85rem] text-white/45 hover:text-[#C8B79E] transition-colors bg-transparent border-none cursor-pointer p-0 font-alilato"
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <div className="text-[0.7rem] tracking-[0.15em] uppercase text-white/30 font-semibold mb-5">Legal</div>
              <ul className="flex flex-col gap-2.5 list-none">
                {[
                  { label: "Aviso de privacidad", path: "/legal/privacidad" },
                  { label: "Términos y condiciones", path: "/legal/terminos" },
                  { label: "Política de cancelación", path: "/legal/cancelacion" },
                ].map((l) => (
                  <li key={l.path}>
                    <button
                      onClick={() => navigate(l.path)}
                      className="text-[0.85rem] text-white/45 hover:text-[#C8B79E] transition-colors bg-transparent border-none cursor-pointer p-0 font-alilato"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <div className="text-[0.7rem] tracking-[0.15em] uppercase text-white/30 font-semibold mb-5">Contacto</div>
              <ul className="flex flex-col gap-2.5 list-none">
                <li><span className="text-[0.85rem] text-white/45 font-alilato">Centro Oils&Love</span></li>
                <li><span className="text-[0.85rem] text-white/45 font-alilato">Jardines del Country, GDL</span></li>
                <li>
                  <a href="mailto:pilatesroomoilslove@gmail.com" className="text-[0.85rem] text-white/45 hover:text-[#C8B79E] transition-colors no-underline font-alilato">
                    pilatesroomoilslove@gmail.com
                  </a>
                </li>
                <li>
                  <button onClick={() => scrollTo("horario")} className="text-[0.85rem] text-white/45 hover:text-[#C8B79E] transition-colors bg-transparent border-none cursor-pointer p-0 font-alilato">
                    Horarios
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p className="text-[0.72rem] text-white/25 font-alilato">&copy; 2026 Pilates Room. Todos los derechos reservados.</p>
            <p className="text-[0.72rem] text-white/25 font-alilato">Hecho con cariño en Guadalajara</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
