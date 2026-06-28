import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks, format,
  isBefore,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingClient } from "@/types/booking";
import { ClassCategoryBadge } from "@/components/ClassCategoryBadge";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ── Category helpers ──────────────────────────────────────────────────────────
type ClassCat = "pilates" | "bienestar" | "all";

const CAT_COLORS: Record<ClassCat, { bg: string; text: string; border: string; dot: string }> = {
  pilates:   { bg: "bg-[#C9A5A8]/20", text: "text-[#8A5A5E]", border: "border-[#C9A5A8]/45", dot: "bg-[#C9A5A8]" },
  bienestar: { bg: "bg-[#806248]/12", text: "text-[#806248]", border: "border-[#806248]/35", dot: "bg-[#806248]" },
  all:       { bg: "bg-[#3B0E1A]/[0.06]", text: "text-[#3B0E1A]", border: "border-[#3B0E1A]/20", dot: "bg-[#3B0E1A]" },
};

const CAT_LABELS: Record<ClassCat, string> = {
  pilates: "Pilates", bienestar: "Bienestar", all: "Todas",
};

// Tono visual por tipo de clase (coherente con el horario público):
// Barre → burgundy, Pilates → dusty rose.
function classTone(name: string): { accent: string; text: string } {
  return /pilates/i.test(name ?? "")
    ? { accent: "#C9A5A8", text: "text-[#8A5A5E]" }
    : { accent: "#3B0E1A", text: "text-[#3B0E1A]" };
}

function inferClassCat(name: string): ClassCat {
  const n = name?.toLowerCase() ?? "";
  if (n.includes("pilates") || n.includes("mat") || n.includes("flow") || n.includes("clásico") || n.includes("terapéutico")) return "pilates";
  if (n.includes("flex") || n.includes("body") || n.includes("strong")) return "bienestar";
  return "pilates"; // default to pilates
}

function canBook(classCat: ClassCat, membershipCat: ClassCat | null): boolean {
  if (!membershipCat || membershipCat === "all") return true;
  return classCat === membershipCat;
}

// ── Clase Muestra schedule restriction ───────────────────────────────────────
const TRIAL_ALLOWED_SCHEDULES = [
  { day: 1, time: "08:20" }, // Lunes 8:20 AM
  { day: 1, time: "19:20" }, // Lunes 7:20 PM
  { day: 2, time: "09:25" }, // Martes 9:25 AM
  { day: 4, time: "09:25" }, // Jueves 9:25 AM
];

function isTrialMembership(membership: any): boolean {
  const rk = String(membership?.repeatKey ?? membership?.repeat_key ?? "").toLowerCase();
  const name = String(membership?.planName ?? membership?.plan_name ?? "").toLowerCase();
  return rk.startsWith("trial_single_session") || name.includes("muestra");
}

function isClassAllowedForTrial(classDate: Date, startTimeStr: string): boolean {
  const day = classDate.getDay(); // 0=Sun … 6=Sat
  const time = startTimeStr.slice(0, 5); // "HH:MM"
  return TRIAL_ALLOWED_SCHEDULES.some((s) => s.day === day && s.time === time);
}

// ── Membership banner ─────────────────────────────────────────────────────────
const MembershipBanner = ({ membership }: { membership: any }) => {
  const cat: ClassCat = (membership.classCategory ?? membership.class_category ?? "all") as ClassCat;
  const colors = CAT_COLORS[cat];
  const remaining = membership.classesRemaining ?? membership.classes_remaining;
  const isUnlimited = remaining === null || remaining === undefined || remaining === 9999;
  const endDate = membership.endDate ?? membership.end_date;

  return (
    <div className="rounded-[1.5rem] border border-[#E8D7D6] bg-[#FCF8F7] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border", colors.bg, colors.border)}>
            <Sparkles size={18} className={colors.text} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-alilato text-sm font-medium text-[#1A060B]">{membership.planName ?? membership.plan_name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
              <span className={cn("font-alilato text-[0.66rem] font-medium uppercase tracking-[0.16em]", colors.text)}>
                {CAT_LABELS[cat]}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[16rem]">
          <div className="rounded-2xl border border-[#E8D7D6] bg-[#F3EFE9]/70 px-4 py-3">
            <div className={cn("font-bebas text-3xl font-light leading-none", colors.text)}>
              {isUnlimited ? "∞" : remaining}
            </div>
            <div className="mt-1 font-alilato text-[0.62rem] uppercase tracking-[0.16em] text-[#9C8A8B]">
              {isUnlimited ? "Ilimitado" : "Clases"}
            </div>
          </div>
          {endDate && (
            <div className="rounded-2xl border border-[#E8D7D6] bg-[#F3EFE9]/70 px-4 py-3 text-right">
              <div className="font-alilato text-sm font-medium text-[#1A060B]">
                {new Date(endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
              </div>
              <div className="mt-1 font-alilato text-[0.62rem] uppercase tracking-[0.16em] text-[#9C8A8B]">
                Vence
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const BookClasses = () => {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const navigate = useNavigate();

  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["public-classes", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
    // Cache de 30s: navegar atrás/adelante o cambiar de semana y volver
    // sirve desde memoria. refetchOnWindowFocus captura ediciones del admin
    // cuando la alumna vuelve a la pestaña.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: bookingsData, isLoading: loadingBookings } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
    staleTime: 30_000,
  });

  const { data: membershipData, isLoading: loadingMembership } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
    staleTime: 60_000,
  });

  const classes: any[] = Array.isArray(classesData?.data) ? classesData.data : Array.isArray(classesData) ? classesData : [];
  const myBookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const rawMem = membershipData?.data !== undefined ? membershipData.data : membershipData;
  const membership = rawMem && typeof rawMem === "object" && "id" in rawMem ? rawMem : null;
  const hasActive = membership?.status === "active";
  const membershipCat: ClassCat | null = hasActive
    ? ((membership.classCategory ?? membership.class_category ?? "all") as ClassCat)
    : null;
  const isTrial = hasActive && isTrialMembership(membership);

  const myBookedClassIds = new Set(myBookings.map((b) => b.class_id));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const classesForDay = (day: Date) =>
    classes
      .filter((c) => {
        if (!c.start_time) return false;
        const dt = safeParse(c.start_time);
        return format(dt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
      })
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  const now = new Date();
  const classesThisWeek = classes.filter((cls) => {
    if (!cls.start_time) return false;
    const dt = safeParse(cls.start_time);
    return !isBefore(dt, weekStart) && !isBefore(weekEnd, dt);
  });
  const bookedThisWeek = classesThisWeek.filter((cls) => myBookedClassIds.has(cls.id)).length;
  const bookableThisWeek = classesThisWeek.filter((cls) => {
    if (!cls.start_time) return false;
    const dt = safeParse(cls.start_time);
    if (isBefore(dt, now)) return false;
    const classCat = inferClassCat(cls.class_type_name ?? "");
    if (!canBook(classCat, membershipCat)) return false;
    if (isTrial && !isClassAllowedForTrial(dt, format(dt, "HH:mm"))) return false;
    return !myBookedClassIds.has(cls.id);
  }).length;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-7xl space-y-6">
          {/* Header */}
          <section className="relative overflow-hidden rounded-[2rem] border border-[#E8D7D6] bg-[#FCF8F7] p-5 sm:p-6">
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B]">
                  Reserva semanal
                </p>
                <h1 className="mt-2 font-bebas text-[clamp(1.9rem,4.5vw,2.8rem)] font-light leading-[1.05] tracking-[0.01em] text-[#1A060B]">
                  Elige tu clase
                </h1>
                <p className="mt-3 max-w-[56ch] text-sm leading-6 text-[#320C16]/72">
                  Revisa cupos por día y confirma el horario que mejor acompañe tu semana.
                </p>
              </div>
              <div className="flex items-center gap-3 self-start lg:self-auto">
                <button
                  type="button"
                  onClick={() => setWeekStart((w) => subWeeks(w, 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8D7D6] text-[#3B0E1A] transition-colors hover:bg-[#F4E6EA]"
                  aria-label="Semana anterior"
                >
                  <ChevronLeft size={18} strokeWidth={1.75} />
                </button>
                <div className="rounded-full bg-[#3B0E1A] px-6 py-2.5">
                  <span className="font-alilato text-[0.8rem] uppercase tracking-[0.14em] text-[#F3EFE9]">
                    {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM", { locale: es })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8D7D6] text-[#3B0E1A] transition-colors hover:bg-[#F4E6EA]"
                  aria-label="Semana siguiente"
                >
                  <ChevronRight size={18} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </section>

          {/* Membership status */}
          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.35fr)_minmax(280px,0.35fr)]">
            {/* Gate en loading: no mostrar "No tienes membresía activa" hasta
                confirmar la respuesta de /memberships/my (evita parpadeo en
                cache fría). */}
            {loadingMembership ? (
              <Skeleton className="h-[4.5rem] w-full rounded-[1.5rem]" />
            ) : hasActive ? (
              <MembershipBanner membership={membership} />
            ) : (
              <div className="rounded-[1.5rem] border border-amber-500/25 bg-amber-50/75 p-4 text-sm">
                <div className="flex items-center gap-3">
                  <AlertCircle size={18} className="shrink-0 text-amber-700" />
                  <span className="text-amber-900">
                    No tienes membresía activa.{" "}
                    <a href="/app/checkout" className="font-bold underline underline-offset-2">Adquiere un plan</a> para reservar.
                  </span>
                </div>
              </div>
            )}
            <div className="rounded-[1.5rem] border border-[#E8D7D6] bg-[#FCF8F7] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-alilato text-[0.62rem] uppercase tracking-[0.18em] text-[#9C8A8B]">Disponibles</p>
                  {/* Gate: evita el flash de "0" antes de que carguen clases/membresía. */}
                  {(loadingClasses || loadingMembership) ? (
                    <Skeleton className="mt-2 h-9 w-12" />
                  ) : (
                    <p className="mt-2 font-bebas text-[2.4rem] font-light leading-none text-[#1A060B]">{bookableThisWeek}</p>
                  )}
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4E6EA]">
                  <CalendarDays size={18} className="text-[#3B0E1A]" strokeWidth={1.75} />
                </span>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-emerald-500/18 bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-alilato text-[0.62rem] uppercase tracking-[0.18em] text-emerald-700/70">Reservadas</p>
                  {/* Gate: evita el flash de "0" antes de que carguen las reservas. */}
                  {loadingBookings ? (
                    <Skeleton className="mt-2 h-9 w-12" />
                  ) : (
                    <p className="mt-2 font-bebas text-[2.4rem] font-light leading-none text-emerald-800">{bookedThisWeek}</p>
                  )}
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100/70">
                  <CheckCircle2 size={18} className="text-emerald-700" strokeWidth={1.75} />
                </span>
              </div>
            </div>
          </section>

          {/* Filter hint */}
          {membershipCat && membershipCat !== "all" && (
            <div className="flex items-center gap-2 rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] px-4 py-3 text-xs">
              <CheckCircle2 size={13} className={CAT_COLORS[membershipCat].text} />
              <span className="font-alilato text-[#3B0E1A]/75">
                Tu membresía <span className={cn("font-semibold", CAT_COLORS[membershipCat].text)}>{CAT_LABELS[membershipCat]}</span> solo permite reservar clases de esa categoría.
              </span>
            </div>
          )}

          {/* Trial schedule restriction banner */}
          {isTrial && (
            <div className="flex items-start gap-3 rounded-2xl border border-blue-500/25 bg-blue-50/75 px-4 py-3 text-sm">
              <Clock size={15} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="text-blue-800 text-xs leading-relaxed">
                <span className="font-semibold">Clase Muestra</span> — solo puedes reservar en estos horarios:
                <ul className="mt-1 ml-3 list-disc space-y-0.5">
                  <li>Lunes: 8:20 AM y 7:20 PM</li>
                  <li>Martes: 9:25 AM</li>
                  <li>Jueves: 9:25 AM</li>
                </ul>
              </div>
            </div>
          )}

          {/* Week grid */}
          <section className="overflow-hidden rounded-[2rem] border border-[#E8D7D6] bg-[#FCF8F7]">
            <div className="overflow-x-auto">
              <div className="grid min-w-[980px] grid-cols-7 divide-x divide-[#3B0E1A]/10">
              {days.map((day, i) => {
                const isToday = format(day, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
                return (
                <div key={i} className="min-h-[36rem] bg-[#F3EFE9]/20">
                  <div className={cn("sticky top-0 z-[1] border-b px-4 py-3 text-center", isToday ? "border-[#3B0E1A]/20 bg-[#3B0E1A]" : "border-[#E8D7D6] bg-[#FCF8F7]")}>
                    <div className={cn("font-alilato text-[0.66rem] uppercase tracking-[0.18em]", isToday ? "text-[#F3EFE9]/80" : "text-[#9C8A8B]")}>{DAYS[i]}</div>
                    <div className={cn("mt-1 font-bebas text-2xl font-light leading-none", isToday ? "text-[#F3EFE9]" : "text-[#1A060B]")}>{format(day, "d")}</div>
                    <div className={cn("mt-1.5 font-alilato text-[0.64rem]", isToday ? "text-[#F3EFE9]/70" : "text-[#3B0E1A]/55")}>
                      {classesForDay(day).length} {classesForDay(day).length === 1 ? "clase" : "clases"}
                    </div>
                  </div>
                  {loadingClasses ? (
                    <div className="space-y-3 p-3">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <Skeleton key={j} className="h-24 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3 p-3">
                      {classesForDay(day).map((cls) => {
                        const isPast = cls.start_time ? isBefore(safeParse(cls.start_time), now) : true;
                        const isBooked = myBookedClassIds.has(cls.id);
                        const classCat = inferClassCat(cls.class_type_name ?? "");
                        const tone = classTone(cls.class_type_name ?? "");
                        const allowed = canBook(classCat, membershipCat);
                        const trialBlocked = isTrial && !isClassAllowedForTrial(day, format(safeParse(cls.start_time), "HH:mm"));
                        const locked = !isBooked && !isPast && (!allowed || trialBlocked);
                        const disabled = isPast || locked;

                        return (
                          <button
                            key={cls.id}
                            disabled={disabled}
                            onClick={() => navigate(`/app/classes/${cls.id}`)}
                            className={cn(
                              "group relative w-full overflow-hidden rounded-2xl border p-4 pl-5 text-left text-xs transition-all duration-200 active:scale-[0.98]",
                              isBooked  && "border-emerald-500/30 bg-emerald-50/80",
                              !isBooked && !disabled && "cursor-pointer border-[#E8D7D6] bg-[#FCF8F7] hover:-translate-y-0.5 hover:border-[#3B0E1A]/35 hover:bg-[#F4E6EA]/60",
                              !isBooked && disabled && "cursor-not-allowed border-[#E8D7D6] bg-[#F3EFE9]/40 opacity-50",
                            )}
                          >
                            <span
                              className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
                              style={{ backgroundColor: isBooked ? "#059669" : disabled ? "#C9A5A8" : tone.accent }}
                            />
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={cn("truncate font-alilato text-sm font-medium", isBooked ? "text-emerald-900" : "text-[#1A060B]")}>
                                  {cls.class_type_name}
                                </p>
                                <p className="mt-2 flex items-center gap-1.5 font-bebas text-xl font-light leading-none text-[#1A060B]">
                                  <Clock size={13} className="text-[#9C8A8B]" strokeWidth={1.75} />
                                  {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : "—"}
                                </p>
                              </div>
                              {isBooked && (
                                <span className="rounded-full bg-emerald-100 p-1 text-emerald-700">
                                  <CheckCircle2 size={14} />
                                </span>
                              )}
                              {locked && (
                                <span className="rounded-full bg-[#3B0E1A]/8 p-1 text-[#9C8A8B]">
                                  <Lock size={13} />
                                </span>
                              )}
                            </div>
                            <div className="mt-4 flex items-center justify-between border-t border-[#E8D7D6] pt-3">
                              <span className="font-alilato text-[0.64rem] uppercase tracking-[0.12em] text-[#9C8A8B]">
                                50 min
                              </span>
                              <span className={cn(
                                "font-alilato rounded-full px-2.5 py-1 text-[0.64rem] font-medium uppercase tracking-[0.1em] transition-colors",
                                isBooked
                                  ? "bg-emerald-100 text-emerald-700"
                                  : disabled
                                    ? "bg-[#3B0E1A]/6 text-[#9C8A8B]"
                                    : "bg-[#3B0E1A] text-[#F3EFE9]"
                              )}>
                                {isBooked ? "Reservada" : disabled ? "No disponible" : "Reservar"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                      {classesForDay(day).length === 0 && (
                        <div className="rounded-2xl border border-dashed border-[#E8D7D6] p-5 text-center">
                          <p className="font-alilato text-xs text-[#9C8A8B]">Sin clases</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
              </div>
            </div>
          </section>

          {/* Legend — solo estados, no categorías (VARRE24 ofrece un único método) */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-50/80 px-3 py-1.5 font-alilato text-xs font-medium text-emerald-700">
              <CheckCircle2 size={12} /> Reservada
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#E8D7D6] bg-[#FCF8F7] px-3 py-1.5 font-alilato text-xs font-medium text-[#3B0E1A]">
              <CalendarDays size={12} /> Disponible
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#E8D7D6] bg-[#3B0E1A]/[0.04] px-3 py-1.5 font-alilato text-xs font-medium text-[#9C8A8B]">
              <Lock size={11} /> No disponible
            </div>
          </div>
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default BookClasses;
