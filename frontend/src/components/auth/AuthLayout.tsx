import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import heroPhoto from "@/assets/varre24/hero-varre24.jpg";

const LOGO_SRC = "/brand/varre24-logo-cream.svg";

interface BrandStat {
  n: string;
  l: string;
}

interface AuthLayoutProps {
  /** Eyebrow + two-tone title block for the form column. */
  heading: ReactNode;
  /** Form + any extras (CTAs, install card, footer). */
  children: ReactNode;
  /** Anton tagline word on the brand panel. */
  brandTagline?: string;
  /** Fraunces italic accent line on the brand panel. */
  brandItalic?: string;
  /** Short body paragraph on the brand panel. */
  brandBlurb?: string;
  /** Small stats row on the brand panel. Pass [] to hide. */
  brandStats?: BrandStat[];
}

const DEFAULT_STATS: BrandStat[] = [
  { n: "07", l: "Cupo · clase" },
  { n: "60", l: "Min · sesión" },
  { n: "29", l: "Clases / semana" },
];

export function AuthLayout({
  heading,
  children,
  brandTagline = "MOVIMIENTO",
  brandItalic = "con propósito.",
  brandBlurb = "Un espacio donde otros roles se quedan afuera. Barre & Pilates Mat en grupos de 7, con un cierre de relajación que cuida tu regreso al día.",
  brandStats = DEFAULT_STATS,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* ── LEFT — brand panel (lg+) ── */}
      <aside className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-[#3A2F26] text-[#F6F2EB]">
        <img
          src={heroPhoto}
          alt="Estudio VARRE24"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2A211B]/82 via-[#2A211B]/35 to-[#2A211B]/45" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* logo */}
          <Reveal y={16}>
            <Link to="/" className="block">
              <img
                src={LOGO_SRC}
                alt="VARRE24"
                className="h-16 w-auto drop-shadow-[0_2px_14px_rgba(43,9,17,0.45)]"
              />
            </Link>
          </Reveal>

          {/* tagline block */}
          <Reveal y={28} delay={0.08}>
            <div>
              <div className="inline-flex items-center gap-2 border border-[#CBBFAF]/45 px-4 py-[7px] rounded-full text-[0.7rem] tracking-[0.2em] uppercase text-[#F6F2EB]/90 mb-6 font-alilato">
                <span className="w-[6px] h-[6px] rounded-full bg-[#CBBFAF]" />
                Nápoles · Benito Juárez, CDMX
              </div>

              <h2 className="font-bebas text-[clamp(3rem,5vw,5.5rem)] leading-[0.9] tracking-tight mb-5">
                {brandTagline}
                {brandItalic && (
                  <span className="block font-editorial italic font-light text-[#E8DDD5] normal-case">
                    {brandItalic}
                  </span>
                )}
              </h2>

              {brandBlurb && (
                <p className="font-alilato text-[0.92rem] leading-[1.7] text-[#F6F2EB]/85 max-w-[360px]">
                  {brandBlurb}
                </p>
              )}

              {brandStats.length > 0 && (
                <div className="flex gap-8 mt-9">
                  {brandStats.map((s) => (
                    <div key={s.l}>
                      <div className="font-bebas text-[1.85rem] leading-none tracking-wide">
                        {s.n}
                      </div>
                      <div className="font-alilato text-[0.68rem] text-[#CBBFAF] uppercase tracking-[0.18em] leading-tight mt-1">
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </aside>

      {/* ── RIGHT — form column ── */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo — brand panel hidden on small screens */}
          <Link to="/" className="lg:hidden flex flex-col items-center mb-10">
            <img src="/brand/varre24-logo-black.svg" alt="VARRE24" className="h-12 w-auto" />
            <span className="font-alilato text-[10px] tracking-[0.22em] uppercase text-muted-foreground mt-2">
              Barre &amp; Pilates · CDMX
            </span>
          </Link>

          {/* page heading */}
          <div className="mb-9">{heading}</div>

          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;
