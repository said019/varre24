import { Link } from "react-router-dom";

const LINKS = [
  { label: "Inicio", href: "#" },
  { label: "Horarios", href: "#clases" },
  { label: "Paquetes", href: "#planes" },
  { label: "Contacto", href: "#contacto" },
];

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
        <a href="#" aria-label="VARRE24 — Inicio" className="mix-blend-difference">
          <img src="/brand/varre24-logo-cream.svg" alt="VARRE24" className="h-5 w-auto sm:h-6" />
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="font-alilato text-[0.92rem] text-[#F3EFE9] mix-blend-difference transition-opacity hover:opacity-60"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/auth/login"
            className="font-alilato text-[0.92rem] text-[#F3EFE9] mix-blend-difference transition-opacity hover:opacity-60"
          >
            Entrar
          </Link>
        </div>

        {/* móvil: solo Entrar */}
        <Link
          to="/auth/login"
          className="font-alilato text-[0.85rem] text-[#F3EFE9] mix-blend-difference md:hidden"
        >
          Entrar
        </Link>
      </nav>
    </header>
  );
}
