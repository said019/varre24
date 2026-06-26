import { Link } from "react-router-dom";

const LINKS = [
  { label: "Clases", href: "#clases" },
  { label: "Experience", href: "#contacto" },
  { label: "Planes", href: "#planes" },
  { label: "Contacto", href: "#contacto" },
];

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
        <a href="#" className="font-bebas text-2xl tracking-tight text-[#FFF1F3] mix-blend-difference">VARRE24</a>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="font-alilato text-sm text-[#FFF1F3] mix-blend-difference">{l.label}</a>
          ))}
        </div>
        <Link to="/auth/login" className="press rounded-full bg-[#7C0116] px-5 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]">
          Entrar
        </Link>
      </nav>
    </header>
  );
}
