import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, addWeeks, addDays, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { Reveal } from "@/lib/motion";

interface Slot {
  day_of_week: number;
  time_slot: string;
  class_type_name: string;
  instructor_name?: string | null;
}

const DAY_SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie" };
const WEEKDAYS = [1, 2, 3, 4, 5]; // Lun–Vie

// Código de color por tipo de clase.
function classStyle(name: string) {
  const isPilates = /pilates/i.test(name);
  return isPilates
    ? { accent: "#C9A5A8", label: "text-[#8A5A5E]" }   // Pilates → dusty rose
    : { accent: "#3B0E1A", label: "text-[#3B0E1A]" };  // Barre → burgundy
}

function toMinutes(t: string): number {
  const m = t.trim().toLowerCase().match(/(\d{1,2}):(\d{2})\s*(a|p)m/);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (m[3] === "p" && h !== 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return h * 60 + min;
}

function splitTime(t: string) {
  const m = t.trim().match(/(\d{1,2}:\d{2})\s*(am|pm)/i);
  return m ? { hm: m[1], ap: m[2].toUpperCase() } : { hm: t, ap: "" };
}

export function Horarios() {
  const [weekOffset, setWeekOffset] = useState(0);

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

  // Semana mostrada (lunes) según offset; el horario es recurrente.
  const monday = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset);
  const columns = WEEKDAYS.map((dow, i) => ({ dow, date: addDays(monday, i) }));
  const rangeStart = columns[0].date;
  const rangeEnd = columns[columns.length - 1].date;
  const rangeLabel = `${format(rangeStart, "d MMM", { locale: es })} – ${format(rangeEnd, "d MMM", { locale: es })}`;

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

        {/* Navegador de semana */}
        <div className="mt-10 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            aria-label="Semana anterior"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8D7D6] text-[#3B0E1A] transition-colors hover:bg-[#F4E6EA] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>

          <div className="rounded-full bg-[#3B0E1A] px-6 py-2.5">
            <span className="font-alilato text-[0.8rem] uppercase tracking-[0.16em] text-[#F3EFE9]">
              {rangeLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Semana siguiente"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8D7D6] text-[#3B0E1A] transition-colors hover:bg-[#F4E6EA]"
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>

          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="font-alilato text-[0.7rem] uppercase tracking-[0.16em] text-[#9C8A8B] transition-colors hover:text-[#3B0E1A]"
            >
              Esta semana
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7]" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#E8D7D6] bg-[#FCF8F7] px-8 py-14 text-center">
            <p className="font-alilato text-sm text-[#3B0E1A]/70">Estamos preparando el horario.</p>
          </div>
        ) : (
          <Reveal className="mt-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {columns.map(({ dow, date }) => {
                const daySlots = byDay.get(dow) ?? [];
                const today = isSameDay(date, new Date());
                return (
                  <div
                    key={dow}
                    className={`flex flex-col overflow-hidden rounded-2xl border bg-[#FCF8F7] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-32px_rgba(59,14,26,0.4)] ${
                      today ? "border-[#3B0E1A]/50" : "border-[#E8D7D6] hover:border-[#C9A5A8]/60"
                    }`}
                  >
                    {/* Banda de día + fecha */}
                    <div
                      className={`flex items-center justify-between border-b px-4 py-3 ${
                        today
                          ? "border-[#3B0E1A]/20 bg-[#3B0E1A] text-[#F3EFE9]"
                          : "border-[#E8D7D6] bg-gradient-to-b from-[#F4E6EA] to-[#F4E6EA]/40 text-[#3B0E1A]"
                      }`}
                    >
                      <span className="font-alilato text-[0.68rem] uppercase tracking-[0.18em]">{DAY_SHORT[dow]}</span>
                      <span className={`font-bebas text-xl font-light leading-none ${today ? "text-[#F3EFE9]" : "text-[#1A060B]"}`}>
                        {format(date, "d")}
                      </span>
                    </div>

                    {/* Clases */}
                    <div className="flex flex-1 flex-col divide-y divide-[#E8D7D6]/70 px-4">
                      {daySlots.length === 0 ? (
                        <p className="py-6 text-center font-alilato text-xs text-[#9C8A8B]">Sin clases</p>
                      ) : (
                        daySlots.map((s, i) => {
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
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        )}

        {/* Leyenda + nota */}
        <div className="mt-10 flex flex-col gap-4 border-t border-[#E8D7D6] pt-6 sm:flex-row sm:items-center sm:justify-between">
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
          <p className="font-alilato text-[0.68rem] uppercase tracking-[0.2em] text-[#9C8A8B]">
            Sábados y domingos · clases privadas y eventos
          </p>
        </div>
      </div>
    </section>
  );
}
