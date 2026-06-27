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

// Código de color por tipo de clase (rítmo visual + significado).
function classStyle(name: string) {
  const isPilates = /pilates/i.test(name);
  return isPilates
    ? { accent: "#C9A5A8", label: "text-[#8A5A5E]" }   // Pilates → dusty rose
    : { accent: "#3B0E1A", label: "text-[#3B0E1A]" };  // Barre → burgundy
}

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

// '7:00 am' → { hm: '7:00', ap: 'AM' }
function splitTime(t: string) {
  const m = t.trim().match(/(\d{1,2}:\d{2})\s*(am|pm)/i);
  return m ? { hm: m[1], ap: m[2].toUpperCase() } : { hm: t, ap: "" };
}

export function Horarios() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-schedule-slots"],
    queryFn: async () => (await api.get("/public/schedule-slots")).data,
    staleTime: 1000 * 60 * 10,
  });

  const slots: Slot[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  const byDay = new Map<number, Slot[]>();
  for (const s of slots) {
    const d = s.day_of_week === 7 ? 0 : s.day_of_week;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(s);
  }
  for (const list of byDay.values()) list.sort((a, b) => toMinutes(a.time_slot) - toMinutes(b.time_slot));

  const days = DAY_ORDER.filter((d) => byDay.has(d) && byDay.get(d)!.length > 0)
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
          <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7]" />
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {days.map((d) => (
                <div
                  key={d}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] transition-all duration-300 hover:-translate-y-1 hover:border-[#C9A5A8]/60 hover:shadow-[0_24px_50px_-32px_rgba(59,14,26,0.4)]"
                >
                  {/* Banda de día */}
                  <div className="border-b border-[#E8D7D6] bg-gradient-to-b from-[#F4E6EA] to-[#F4E6EA]/40 px-4 py-3.5 text-center">
                    <p className="font-alilato text-[0.7rem] uppercase tracking-[0.22em] text-[#3B0E1A]">
                      <span className="lg:hidden">{DAY_LABEL[d]}</span>
                      <span className="hidden lg:inline">{DAY_SHORT[d]}</span>
                    </p>
                  </div>

                  {/* Clases */}
                  <div className="flex flex-1 flex-col divide-y divide-[#E8D7D6]/70 px-4">
                    {byDay.get(d)!.map((s, i) => {
                      const st = classStyle(s.class_type_name);
                      const { hm, ap } = splitTime(s.time_slot);
                      return (
                        <div key={i} className="relative py-4 pl-3.5">
                          <span
                            className="absolute bottom-4 left-0 top-4 w-[2px] rounded-full"
                            style={{ backgroundColor: st.accent }}
                          />
                          <p className="flex items-baseline gap-1">
                            <span className="font-bebas text-xl font-light leading-none tracking-[0.01em] text-[#1A060B]">
                              {hm}
                            </span>
                            <span className="font-alilato text-[0.58rem] font-medium tracking-[0.06em] text-[#9C8A8B]">
                              {ap}
                            </span>
                          </p>
                          <p className={`mt-2 font-alilato text-[0.74rem] font-medium uppercase tracking-[0.08em] ${st.label}`}>
                            {s.class_type_name}
                          </p>
                          {s.instructor_name && (
                            <p className="mt-0.5 font-alilato text-[0.62rem] uppercase tracking-[0.14em] text-[#9C8A8B]">
                              {s.instructor_name}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Leyenda + nota */}
        <div className="mt-10 flex flex-col gap-5 border-t border-[#E8D7D6] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3B0E1A]" />
              <span className="font-alilato text-[0.7rem] uppercase tracking-[0.16em] text-[#3B0E1A]">Barre</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#C9A5A8]" />
              <span className="font-alilato text-[0.7rem] uppercase tracking-[0.16em] text-[#8A5A5E]">Pilates</span>
            </span>
          </div>
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

        <p className="mt-4 font-alilato text-[0.68rem] uppercase tracking-[0.22em] text-[#9C8A8B]">
          Sábados y domingos · clases privadas y eventos
        </p>
      </div>
    </section>
  );
}
