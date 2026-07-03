import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { SHELL_PHOTOS, type PhotoAsset } from "@/components/landing/photoAssets";

interface AuthLayoutProps {
  /** Eyebrow + title block for the form column. */
  heading: ReactNode;
  /** Form + any extras. */
  children: ReactNode;
  /** Foto del panel lateral — cada pantalla (login/registro/recuperar/restablecer) trae la suya. */
  photo?: PhotoAsset;
}

/**
 * AuthLayout — columna centrada, minimal, sobre crema.
 * Espejo del logo de marca: VARRE=24 + "Barre & Pilates", monocromo, mucho aire.
 */
export function AuthLayout({ heading, children, photo = SHELL_PHOTOS.auth }: AuthLayoutProps) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
      <div className="flex flex-col items-center px-6 py-5 sm:py-8">
        {/* Logo lockup — espejo del logo oficial */}
        <Reveal y={14}>
          <Link to="/" className="flex flex-col items-center" aria-label="VARRE24 — Inicio">
            <img src="/brand/varre24-logo-black.svg" alt="VARRE24" className="h-7 w-auto sm:h-8" />
            <span className="mt-2 text-[0.6rem] tracking-[0.4em] uppercase text-muted-foreground">
              Barre &amp; Pilates
            </span>
          </Link>
        </Reveal>

        {/* Columna del formulario */}
        <Reveal y={24} delay={0.06} className="w-full max-w-[400px] mt-4 sm:mt-6">
          <div className="mb-5">{heading}</div>
          {children}
        </Reveal>

        <p className="mt-5 text-[0.62rem] tracking-[0.26em] uppercase text-muted-foreground/55">
          Nápoles · Benito Juárez · CDMX
        </p>
      </div>

      <aside className="relative hidden min-h-[100dvh] overflow-hidden bg-[#1A060B] lg:block">
        <img
          src={photo.src}
          alt={photo.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Velo vino + firma rosa, espejo del hero de la landing */}
        <div className="absolute inset-0 bg-[#3B0E1A]/45" />
        <p className="absolute inset-x-10 bottom-14 font-alilato text-[0.6rem] uppercase tracking-[0.34em] text-[#FFD6E6]/90">
          Movimiento · Intención · Elegancia
        </p>
        <div className="absolute inset-x-10 bottom-10 h-px bg-[#FFD6E6]/55" />
      </aside>
    </div>
  );
}

export default AuthLayout;
