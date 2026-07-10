import { useQuery } from "@tanstack/react-query";
import { Reveal, MagneticButton } from "@/lib/motion";
import api from "@/lib/api";
import { STUDIO } from "./data";

function toInstagramUrl(handle: string): string {
  if (!handle) return STUDIO.instagramUrl;
  if (handle.startsWith("http")) return handle;
  return `https://www.instagram.com/${handle.replace(/^@/, "")}`;
}

function toFacebookUrl(value: string): string {
  if (value.startsWith("http")) return value;
  return `https://www.facebook.com/${value.replace(/^@/, "")}`;
}

export function ContactFooter() {
  // Datos del estudio en vivo desde el admin (general_settings, público). Si no
  // hay valor guardado, caemos a las constantes de data.ts. Antes la landing
  // ignoraba por completo lo que la dueña configuraba en Ajustes.
  const { data } = useQuery({
    queryKey: ["public-general-settings"],
    queryFn: async () => (await api.get("/public/settings/general_settings")).data,
    staleTime: 60_000,
    retry: false,
  });
  const gs: Record<string, any> = data?.data ?? {};

  const studioName = String(gs.studio_name || "VARRE24");
  const address = String(gs.address || STUDIO.address);
  const igHandle = String(gs.instagram || STUDIO.instagram);
  const igUrl = toInstagramUrl(igHandle);
  const facebook = String(gs.facebook || "");
  const phone = String(gs.phone || "");
  const mapsQuery = encodeURIComponent(address);

  return (
    <footer id="contacto" className="bg-[#260910] px-6 py-16 text-[#F3EFE9] sm:px-10 lg:px-16">
      <Reveal className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#FFD6E6]">Contacto</p>
            <h2 className="font-bebas mt-3 text-[clamp(2rem,4.5vw,3.2rem)] font-light leading-tight tracking-[0.02em]">Ven a {studioName}</h2>
            <p className="font-alilato mt-4 max-w-sm text-sm leading-relaxed text-[#EADCDD]/85">{address}</p>
            <a href={igUrl} className="font-alilato mt-2 inline-block text-[#FFD6E6]">{igHandle}</a>
            {facebook && (
              <a href={toFacebookUrl(facebook)} className="font-alilato mt-1 block text-[#FFD6E6]">Facebook</a>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="font-alilato mt-1 block text-[#EADCDD]/85">{phone}</a>
            )}
            <div className="mt-6">
              <MagneticButton href="/app/classes" className="press inline-flex items-center rounded-full bg-[#FFD6E6] px-7 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#3B0E1A]">
                Reservar clase
              </MagneticButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[#C9A5A8]/20">
            <iframe
              title={`Mapa ${studioName}`}
              src={`https://www.google.com/maps?q=${mapsQuery}&output=embed`}
              className="h-64 w-full md:h-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        </div>
        <div className="font-alilato mt-12 flex flex-col items-start justify-between gap-2 border-t border-[#C9A5A8]/15 pt-6 text-xs text-[#EADCDD]/70 sm:flex-row">
          <span>© {new Date().getFullYear()} {studioName} · Barre &amp; Pilates · CDMX</span>
          <span>Movimiento · Intención · Elegancia · Constancia</span>
        </div>
      </Reveal>
    </footer>
  );
}
