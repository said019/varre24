import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { PLANS } from "./data";

// El copy editorial (nota, detalle, tag) vive aquí porque la dueña lo escribió
// a mano para cada plan. El PRECIO y la disponibilidad SIEMPRE vienen vivos de
// /api/plans — antes esta sección mostraba precios fijos en el bundle, así que
// un cambio de precio en el admin nunca se veía reflejado en el sitio público.
const COPY_BY_NAME = new Map(PLANS.map((p) => [p.name, p]));

function formatPrice(n: number): string {
  return `$${Math.round(n).toLocaleString("es-MX")}`;
}

export function PlansTeaser() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => (await api.get("/plans")).data,
    staleTime: 60_000,
  });
  const livePlans: any[] = Array.isArray(data?.data) ? data.data : [];

  const plans = livePlans.map((lp) => {
    const copy = COPY_BY_NAME.get(lp.name);
    const classLimit = lp.classLimit ?? lp.class_limit;
    const durationDays = lp.durationDays ?? lp.duration_days ?? 30;
    return {
      name: lp.name as string,
      price: formatPrice(Number(lp.price ?? 0)),
      unit: lp.currency ?? "MXN",
      note: copy?.note ?? "",
      detail: copy?.detail ?? `${classLimit ? `${classLimit} clases` : "Ilimitado"} · vigencia ${durationDays} días`,
      tag: copy?.tag,
      featured: copy?.featured ?? /mensual/i.test(String(lp.name ?? "")),
    };
  });

  return (
    <section id="planes" className="bg-gradient-to-b from-[#FFD6E6] via-[#FFE4EE] to-[#F3EFE9] px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#9C8A8B]">Membresías</p>
          <h2 className="font-bebas mt-3 text-[clamp(2.2rem,5vw,3.4rem)] font-light tracking-[0.02em] text-[#1A060B]">
            Planes
          </h2>
          <p className="font-alilato mt-3 max-w-md text-sm text-[#3B0E1A]/75">
            Elige cómo quieres moverte. Sin permanencia forzada.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))
          ) : (
            plans.map((p) => {
              const featured = p.featured;
              return (
                <Reveal key={p.name} className="h-full">
                  <div
                    className={[
                      "group flex h-full flex-col rounded-2xl border p-6 transition-all duration-300",
                      featured
                        ? "border-[#3B0E1A] bg-[#3B0E1A] text-[#F3EFE9] shadow-[0_24px_60px_-30px_rgba(59,14,26,0.55)]"
                        : "border-[#E8D7D6] bg-[#FCF8F7] hover:-translate-y-1 hover:border-[#3B0E1A]/35",
                    ].join(" ")}
                  >
                    {/* fila reservada para el tag → nombres alineados entre cards */}
                    <div className="mb-3 h-[18px]">
                      {p.tag && (
                        <span
                          className={[
                            "inline-flex rounded-full px-2.5 py-0.5 font-alilato text-[0.56rem] uppercase tracking-[0.16em]",
                            featured ? "bg-[#FFD6E6] text-[#3B0E1A]" : "bg-[#FFD6E6] text-[#3B0E1A]",
                          ].join(" ")}
                        >
                          {p.tag}
                        </span>
                      )}
                    </div>

                    <p
                      className={[
                        "font-alilato text-[0.66rem] uppercase tracking-[0.18em]",
                        featured ? "text-[#F3EFE9]/60" : "text-[#9C8A8B]",
                      ].join(" ")}
                    >
                      {p.name}
                    </p>

                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span
                        className={[
                          "font-bebas text-[2.1rem] font-light leading-none tracking-[0.01em]",
                          featured ? "text-[#F3EFE9]" : "text-[#1A060B]",
                        ].join(" ")}
                      >
                        {p.price}
                      </span>
                      {p.unit && (
                        <span className={featured ? "font-alilato text-[0.62rem] text-[#F3EFE9]/45" : "font-alilato text-[0.62rem] text-[#9C8A8B]"}>
                          {p.unit}
                        </span>
                      )}
                    </div>

                    <p className={featured ? "mt-2 font-alilato text-sm text-[#F3EFE9]/85" : "mt-2 font-alilato text-sm text-[#1A060B]"}>
                      {p.note}
                    </p>

                    <div className={featured ? "mt-4 border-t border-[#F3EFE9]/15 pt-4" : "mt-4 border-t border-[#E8D7D6] pt-4"}>
                      <p className={featured ? "font-alilato text-xs leading-relaxed text-[#F3EFE9]/65" : "font-alilato text-xs leading-relaxed text-[#3B0E1A]/60"}>
                        {p.detail}
                      </p>
                    </div>

                    <Link
                      to="/auth/register"
                      className={[
                        "mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 font-alilato text-[0.7rem] font-medium uppercase tracking-[0.14em] transition-colors",
                        featured
                          ? "bg-[#FFD6E6] font-semibold text-[#3B0E1A] hover:bg-[#FFE4EE]"
                          : "border border-[#3B0E1A] text-[#3B0E1A] hover:bg-[#3B0E1A] hover:text-[#F3EFE9]",
                      ].join(" ")}
                    >
                      Empezar
                    </Link>
                  </div>
                </Reveal>
              );
            })
          )}
        </div>

        <p className="mt-8 font-alilato text-[0.7rem] uppercase tracking-[0.22em] text-[#9C8A8B]">
          Precios en MXN · sin permanencia · clases de 60 min
        </p>
      </div>
    </section>
  );
}
