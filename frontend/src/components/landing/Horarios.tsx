import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { startOfWeek, addWeeks, addDays, format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Clock, User, Users, Timer, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { Reveal } from "@/lib/motion";
import { waLink } from "./data";

interface Slot {
  day_of_week: number;
  time_slot: string;
  class_type_name: string;
  instructor_name?: string | null;
  capacity?: number | null;
}

const DAY_SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie" };
const DAY_LABEL: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" };
const WEEKDAYS = [1, 2, 3, 4, 5]; // Lun–Vie

// Código de color por tipo de clase.
function classStyle(name: string) {
  const isPilates = /pilates/i.test(name);
  return isPilates
    ? { accent: "#C9A5A8", label: "text-[#8A5A5E]" }   // Pilates → dusty rose
    : { accent: "#3B0E1A", label: "text-[#3B0E1A]" };  // Barre → burgundy
}

function classDesc(name: string): string {
  return /pilates/i.test(name)
    ? "Fuerza profunda, control y equilibrio desde el centro del cuerpo. Trabajo de core, postura y respiración consciente."
    : "Ballet, fuerza y resistencia para tonificar cuerpo y postura. Movimientos precisos al ritmo de la música.";
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

type Selected = { slot: Slot; dow: number; date: Date };

export function Horarios() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);

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
            Lunes a viernes. Toca una clase para ver el detalle y el cupo.
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
                    className={`flex flex-col overflow-hidden rounded-2xl border bg-[#FCF8F7] transition-all duration-300 hover:shadow-[0_24px_50px_-32px_rgba(59,14,26,0.4)] ${
                      today ? "border-[#3B0E1A]/50" : "border-[#E8D7D6]"
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
                    <div className="flex flex-1 flex-col divide-y divide-[#E8D7D6]/70 px-1">
                      {daySlots.length === 0 ? (
                        <p className="py-6 text-center font-alilato text-xs text-[#9C8A8B]">Sin clases</p>
                      ) : (
                        daySlots.map((s, i) => {
                          const st = classStyle(s.class_type_name);
                          const { hm, ap } = splitTime(s.time_slot);
                          const cupo = s.capacity ?? 7;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelected({ slot: s, dow, date })}
                              className="group relative w-full rounded-xl px-2.5 py-3.5 pl-4 text-left transition-colors hover:bg-[#F4E6EA]/50"
                            >
                              <span
                                className="absolute bottom-3.5 left-1.5 top-3.5 w-[2px] rounded-full"
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
                              <p className="mt-2 inline-flex items-center gap-1 font-alilato text-[0.6rem] uppercase tracking-[0.1em] text-[#9C8A8B]">
                                <Users size={10} strokeWidth={1.75} />
                                {cupo} lugares
                              </p>
                            </button>
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

      {/* ── Modal de detalle de clase ── */}
      {selected && (() => {
        const { slot, dow, date } = selected;
        const st = classStyle(slot.class_type_name);
        const { hm, ap } = splitTime(slot.time_slot);
        const cupo = slot.capacity ?? 7;
        const rows = [
          { icon: Clock, label: "Hora", value: `${hm} ${ap}` },
          { icon: User, label: "Instructora", value: slot.instructor_name || "Por confirmar" },
          { icon: Timer, label: "Duración", value: "60 min" },
          { icon: Users, label: "Cupo", value: `${cupo} lugares` },
        ];
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A060B]/45 p-4 backdrop-blur-[2px] sm:items-center"
            onClick={() => setSelected(null)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-3xl border border-[#E8D7D6] bg-[#FCF8F7] shadow-[0_40px_90px_-30px_rgba(26,6,11,0.55)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Encabezado con acento de tipo */}
              <div className="relative border-b border-[#E8D7D6] p-7">
                <span className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: st.accent }} />
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Cerrar"
                  className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[#9C8A8B] transition-colors hover:bg-[#F4E6EA] hover:text-[#3B0E1A]"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
                <p className="font-alilato text-[0.64rem] uppercase tracking-[0.24em] text-[#9C8A8B]">
                  {DAY_LABEL[dow]} {format(date, "d 'de' MMMM", { locale: es })}
                </p>
                <h3 className={`mt-2 font-bebas text-[2rem] font-light leading-none tracking-[0.01em] ${st.label}`}>
                  {slot.class_type_name}
                </h3>
              </div>

              {/* Datos */}
              <div className="grid grid-cols-2 gap-px bg-[#E8D7D6]">
                {rows.map((r) => (
                  <div key={r.label} className="bg-[#FCF8F7] p-5">
                    <p className="flex items-center gap-1.5 font-alilato text-[0.58rem] uppercase tracking-[0.16em] text-[#9C8A8B]">
                      <r.icon size={11} strokeWidth={1.75} /> {r.label}
                    </p>
                    <p className="mt-1.5 font-alilato text-sm font-medium text-[#1A060B]">{r.value}</p>
                  </div>
                ))}
              </div>

              {/* Descripción + CTA */}
              <div className="p-7">
                <p className="font-alilato text-sm leading-relaxed text-[#3B0E1A]/75">
                  {classDesc(slot.class_type_name)}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/auth/login"
                    className="press inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#3B0E1A] px-6 py-3 font-alilato text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] no-underline transition-colors hover:bg-[#320C16]"
                  >
                    Reservar <ArrowRight size={14} />
                  </Link>
                  <a
                    href={waLink(slot.class_type_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-[#E8D7D6] px-6 py-3 font-alilato text-[0.74rem] font-medium uppercase tracking-[0.12em] text-[#3B0E1A] no-underline transition-colors hover:bg-[#F4E6EA]"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
