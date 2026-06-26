import { Link } from "react-router-dom";

const LINKS = [
  { label: "Clases", href: "#clases" },
  { label: "Experience", href: "#experience" },
  { label: "Planes", href: "#planes" },
  { label: "Contacto", href: "#contacto" },
];

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
        <a href="#" aria-label="VARRE24 — Inicio" className="mix-blend-difference">
          <img src="/brand/varre24-logo-cream.svg" alt="VARRE24" className="h-5 w-auto sm:h-6" />
        </a>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="font-alilato text-sm text-[#F6F2EB] mix-blend-difference">{l.label}</a>
          ))}
        </div>
        <Link to="/auth/login" className="press rounded-full bg-[#5B4A3E] px-5 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#F6F2EB]">
          Entrar
        </Link>
      </nav>
    </header>
  );
}
