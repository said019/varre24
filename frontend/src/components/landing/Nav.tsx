import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Inicio", href: "#" },
  { label: "Horarios", href: "#horarios" },
  { label: "Paquetes", href: "#planes" },
  { label: "Contacto", href: "#contacto" },
];

export function Nav() {
  // mix-blend-difference solo se ve bien sobre el hero (fondo oscuro): al
  // bajar a secciones claras (rosa/marfil) el texto se vuelve casi invisible
  // ("se pierde la barra"). Pasado el hero, la nav cambia a fondo sólido con
  // texto de color fijo — así siempre hay contraste, sin importar qué haya detrás.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Barra de anuncio — soft pink (paleta MODDO) */}
      <Link
        to="/app/eventos"
        className="block bg-[#FFD6E6] px-4 py-2.5 text-center font-alilato text-[0.74rem] font-medium tracking-[0.06em] text-[#3B0E1A] no-underline transition-colors hover:bg-[#FFE4EE]"
      >
        Celebra tu cumpleaños en VARRE24: estudio exclusivo para tu grupo ·{" "}
        <span className="font-semibold underline underline-offset-[3px]">Conoce los paquetes</span>
      </Link>
      <nav
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between px-6 py-5 transition-colors duration-300 sm:px-10",
          scrolled && "border-b border-[#E8D7D6] bg-[#F3EFE9]/95 backdrop-blur-md py-4"
        )}
      >
        <a href="#" aria-label="VARRE24 — Inicio" className={cn(!scrolled && "mix-blend-difference")}>
          <img
            src={scrolled ? "/brand/varre24-logo-black.svg" : "/brand/varre24-logo-cream.svg"}
            alt="VARRE24"
            className="h-5 w-auto sm:h-6"
          />
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className={cn(
                "font-alilato text-[0.92rem] transition-opacity hover:opacity-60",
                scrolled ? "text-[#1A060B]" : "text-[#F3EFE9] mix-blend-difference"
              )}
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/auth/login"
            className={cn(
              "font-alilato text-[0.92rem] transition-opacity hover:opacity-60",
              scrolled ? "text-[#1A060B]" : "text-[#F3EFE9] mix-blend-difference"
            )}
          >
            Entrar
          </Link>
        </div>

        {/* móvil: solo Entrar */}
        <Link
          to="/auth/login"
          className={cn(
            "font-alilato text-[0.85rem] md:hidden",
            scrolled ? "text-[#1A060B]" : "text-[#F3EFE9] mix-blend-difference"
          )}
        >
          Entrar
        </Link>
      </nav>
    </header>
  );
}
