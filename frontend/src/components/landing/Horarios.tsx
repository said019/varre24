import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Reveal } from "@/lib/motion";
import { waLink } from "./data";

interface Slot {
  day_of_week: number;
  time_slot: string;
  class_type_name: string;
  instructor_name?: string | null;
}

const DAY_LABEL: Record<number, string> = {
  1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 0: "Domingo", 7: "Domingo",
};
const DAY_SHORT: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom", 7: "Dom",
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0, 7];

// '7:00 am' / '7:30 pm' → minutos desde medianoche (para ordenar)
function toMinutes(t: string): number {
  const m = t.trim().toLowerCase().match(/(\d{1,2}):(\d{2})\s*(a|p)m/);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3] === "p" && h !== 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return h * 60 + min;
}

export function Horarios() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-schedule-slots"],
    queryFn: async () => (await api.get("/public/schedule-slots")).data,
    staleTime: 1000 * 60 * 10,
  });

  const slots: Slot[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  // Agrupar por día (normalizando 7→0) y ordenar por hora.
  const byDay = new Map<number, Slot[]>();
  for (const s of slots) {
    const d = s.day_of_week === 7 ? 0 : s.day_of_week;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  for (const list of byDay.values()) list.sort((a, b) => toMinutes(a.time_slot) - toMinutes(b.time_slot));

  const days = DAY_ORDER.filter((d) => byDay.has(d) && (byDay.get(d)!.length > 0))
    .filter((d, i, arr) => arr.indexOf(d) === i);

  return (
    <section id="horarios" className="bg-[#F3EFE9] px-6 py-24 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="font-alilato text-xs uppercase tracking-[0.3em] text-[#9C8A8B]">Horarios</p>
          <h2 className="font-bebas mt-3 text-[clamp(2.2rem,5vw,3.4rem)] font-light tracking-[0.02em] text-[#1A060B]">
            Horario semanal
          </h2>
          <p className="font-alilato mt-3 max-w-md text-sm text-[#3B0E1A]/75">
            Lunes a viernes. Reserva tu lugar con anticipación.
          </p>
        </Reveal>

        {isLoading ? (
          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E8D7D6] bg-[#E8D7D6] sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-56 bg-[#FCF8F7]" />
            ))}
          </div>
        ) : days.length === 0 ? (
          <div className="mt-14 rounded-2xl border border-dashed border-[#E8D7D6] bg-[#FCF8F7] px-8 py-14 text-center">
            <p className="font-alilato text-sm text-[#3B0E1A]/70">
              Estamos preparando el horario. Escríbenos por WhatsApp y te compartimos los horarios disponibles.
            </p>
          </div>
        ) : (
          <Reveal className="mt-14">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E8D7D6] bg-[#E8D7D6] sm:grid-cols-3 lg:grid-cols-5">
              {days.map((d) => (
                <div key={d} className="flex flex-col bg-[#FCF8F7] p-5">
                  <p className="font-alilato text-[0.64rem] uppercase tracking-[0.22em] text-[#9C8A8B]">
                    <span className="lg:hidden">{DAY_LABEL[d]}</span>
                    <span className="hidden lg:inline">{DAY_SHORT[d]}</span>
                  </p>
                  <div className="mt-4 flex-1 space-y-3">
                    {byDay.get(d)!.map((s, i) => (
                      <div key={i} className="border-b border-[#E8D7D6]/70 pb-3 last:border-0 last:pb-0">
                        <p className="font-bebas text-lg font-light leading-none tracking-[0.01em] text-[#1A060B]">
                          {s.time_slot.replace(/\s?(am|pm)/i, (x) => x.toLowerCase())}
                        </p>
                        <p className="mt-1.5 inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#C9A5A8]" />
                          <span className="font-alilato text-xs text-[#3B0E1A]/75">{s.class_type_name}</span>
                        </p>
                        {s.instructor_name && (
                          <p className="mt-0.5 pl-3 font-alilato text-[0.66rem] uppercase tracking-[0.12em] text-[#9C8A8B]">
                            {s.instructor_name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        <div className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="font-alilato text-[0.7rem] uppercase tracking-[0.22em] text-[#9C8A8B]">
            Sábados y domingos · clases privadas y eventos
          </p>
          <a
            href={waLink("una clase")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-alilato text-[0.72rem] uppercase tracking-[0.18em] text-[#3B0E1A] transition-opacity hover:opacity-70"
          >
            Reservar por WhatsApp
            <span aria-hidden>&rarr;</span>
          </a>
        </div>
      </div>
    </section>
  );
}
