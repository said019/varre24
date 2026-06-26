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
  pilates:   { bg: "bg-[#E7C9CF]/15", text: "text-[#4a5638]",  border: "border-[#E7C9CF]/40", dot: "bg-[#6b7a52]"  },
  bienestar: { bg: "bg-[#7C0116]/15", text: "text-[#670626]",  border: "border-[#7C0116]/40", dot: "bg-[#9B5A66]"  },
  all:       { bg: "bg-[#7C0116]/[0.06]",      text: "text-[#2B0911]/70",   border: "border-[#7C0116]/20",     dot: "bg-[#7C0116]/40"   },
};

const CAT_LABELS: Record<ClassCat, string> = {
  pilates: "Pilates", bienestar: "Bienestar", all: "Todas",
};

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
    <div className="rounded-[1.5rem] border border-[#7C0116]/14 bg-white/58 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_18px_50px_-40px_rgba(74,51,41,0.42)] backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border", colors.bg, colors.border)}>
            <Sparkles size={18} className={colors.text} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#2B0911]">{membership.planName ?? membership.plan_name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
              <span className={cn("text-[0.68rem] font-bold uppercase tracking-[0.16em]", colors.text)}>
                {CAT_LABELS[cat]}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[16rem]">
          <div className="rounded-2xl border border-[#7C0116]/10 bg-[#FFF1F3]/70 px-4 py-3">
            <div className={cn("text-2xl font-bold leading-none", colors.text)}>
              {isUnlimited ? "∞" : remaining}
            </div>
            <div className="mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#5C0110]/60">
              {isUnlimited ? "Ilimitado" : "Clases"}
            </div>
          </div>
          {endDate && (
            <div className="rounded-2xl border border-[#7C0116]/10 bg-[#FFF1F3]/70 px-4 py-3 text-right">
              <div className="text-sm font-bold text-[#2B0911]">
                {new Date(endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
              </div>
              <div className="mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-[#5C0110]/60">
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
          <section className="relative overflow-hidden rounded-[2rem] border border-[#7C0116]/12 bg-[#FFF1F3]/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_24px_70px_-52px_rgba(74,51,41,0.6)] backdrop-blur sm:p-6">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#E7C9CF]/20 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#7C0116]/58">
                  Reserva semanal
                </p>
                <h1 className="mt-2 font-alilato text-3xl font-bold leading-none tracking-[0] text-[#2B0911] sm:text-4xl">
                  Elige tu clase
                </h1>
                <p className="mt-3 max-w-[56ch] text-sm leading-6 text-[#5C0110]/72">
                  Revisa cupos por día y confirma el horario que mejor acompañe tu semana.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start rounded-2xl border border-[#7C0116]/12 bg-white/62 p-1.5 shadow-[0_16px_42px_-34px_rgba(74,51,41,0.55)] lg:self-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setWeekStart((w) => subWeeks(w, 1))}
                  className="h-11 w-11 rounded-xl text-[#2B0911] hover:bg-[#7C0116]/10"
                  aria-label="Semana anterior"
                >
                  <ChevronLeft size={18} />
                </Button>
                <div className="min-w-[12.5rem] px-3 text-center">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[#7C0116]/55">Semana</p>
                  <p className="mt-0.5 text-sm font-bold text-[#2B0911]">
                    {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                  className="h-11 w-11 rounded-xl text-[#2B0911] hover:bg-[#7C0116]/10"
                  aria-label="Semana siguiente"
                >
                  <ChevronRight size={18} />
                </Button>
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
              <div className="rounded-[1.5rem] border border-amber-500/25 bg-amber-50/75 p-4 text-sm shadow-[0_18px_50px_-40px_rgba(146,64,14,0.42)]">
                <div className="flex items-center gap-3">
                  <AlertCircle size={18} className="shrink-0 text-amber-700" />
                  <span className="text-amber-900">
                    No tienes membresía activa.{" "}
                    <a href="/app/checkout" className="font-bold underline underline-offset-2">Adquiere un plan</a> para reservar.
                  </span>
                </div>
              </div>
            )}
            <div className="rounded-[1.5rem] border border-[#7C0116]/12 bg-white/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#7C0116]/55">Disponibles</p>
                  {/* Gate: evita el flash de "0" antes de que carguen clases/membresía. */}
                  {(loadingClasses || loadingMembership) ? (
                    <Skeleton className="mt-2 h-8 w-12" />
                  ) : (
                    <p className="mt-2 text-3xl font-bold leading-none text-[#2B0911]">{bookableThisWeek}</p>
                  )}
                </div>
                <CalendarDays size={22} className="text-[#7C0116]/55" />
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-emerald-500/18 bg-emerald-50/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-emerald-700/60">Reservadas</p>
                  {/* Gate: evita el flash de "0" antes de que carguen las reservas. */}
                  {loadingBookings ? (
                    <Skeleton className="mt-2 h-8 w-12" />
                  ) : (
                    <p className="mt-2 text-3xl font-bold leading-none text-emerald-800">{bookedThisWeek}</p>
                  )}
                </div>
                <CheckCircle2 size={22} className="text-emerald-600/65" />
              </div>
            </div>
          </section>

          {/* Filter hint */}
          {membershipCat && membershipCat !== "all" && (
            <div className="flex items-center gap-2 rounded-2xl border border-[#7C0116]/10 bg-white/42 px-4 py-3 text-xs">
              <CheckCircle2 size={13} className={CAT_COLORS[membershipCat].text} />
              <span className="text-[#5C0110]/72">
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
          <section className="overflow-hidden rounded-[2rem] border border-[#7C0116]/12 bg-white/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.76),0_26px_78px_-56px_rgba(74,51,41,0.58)] backdrop-blur">
            <div className="overflow-x-auto">
              <div className="grid min-w-[980px] grid-cols-7 divide-x divide-[#7C0116]/10">
              {days.map((day, i) => (
                <div key={i} className="min-h-[36rem] bg-[#FFF1F3]/20">
                  <div className="sticky top-0 z-[1] border-b border-[#7C0116]/10 bg-[#FFF7F8]/92 px-4 py-4 text-center backdrop-blur">
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#5C0110]/58">{DAYS[i]}</div>
                    <div className="mt-1 text-2xl font-bold leading-none text-[#2B0911]">{format(day, "d")}</div>
                    <div className="mt-2 text-[0.68rem] font-semibold text-[#7C0116]/58">
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
                        const c = CAT_COLORS[classCat];
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
                              "group relative w-full overflow-hidden rounded-2xl border p-4 text-left text-xs transition-all duration-200 active:scale-[0.99]",
                              isBooked  && "border-emerald-500/30 bg-emerald-50/80 shadow-[0_14px_34px_-28px_rgba(4,120,87,0.65)]",
                              !isBooked && !disabled && cn(c.border, "cursor-pointer bg-white/72 shadow-[0_16px_42px_-34px_rgba(74,51,41,0.48)] hover:-translate-y-0.5 hover:border-[#7C0116]/35 hover:bg-[#FFF7F8]"),
                              !isBooked && isPast  && "cursor-not-allowed border-[#7C0116]/10 bg-white/20 opacity-42",
                              !isBooked && locked  && "cursor-not-allowed border-[#7C0116]/10 bg-white/24 opacity-45",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", isBooked ? "bg-emerald-500" : c.dot)} />
                                  <p className={cn("truncate text-sm font-bold", isBooked ? "text-emerald-900" : "text-[#2B0911]")}>
                                    {cls.class_type_name}
                                  </p>
                                  <ClassCategoryBadge classTypeName={cls.class_type_name ?? ""} />
                                </div>
                                <p className="mt-3 flex items-center gap-1.5 text-lg font-bold leading-none text-[#2B0911]">
                                  <Clock size={14} className="text-[#7C0116]/58" />
                                  {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : "—"}
                                </p>
                              </div>
                              {isBooked && (
                                <span className="rounded-full bg-emerald-100 p-1 text-emerald-700">
                                  <CheckCircle2 size={14} />
                                </span>
                              )}
                              {locked && (
                                <span className="rounded-full bg-[#7C0116]/8 p-1 text-[#5C0110]/45">
                                  <Lock size={13} />
                                </span>
                              )}
                            </div>
                            <div className="mt-4 flex items-center justify-between border-t border-[#7C0116]/10 pt-3">
                              <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#5C0110]/52">
                                50 min
                              </span>
                              <span className={cn(
                                "rounded-full px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em]",
                                isBooked
                                  ? "bg-emerald-100 text-emerald-700"
                                  : disabled
                                    ? "bg-[#7C0116]/8 text-[#5C0110]/42"
                                    : "bg-[#7C0116]/10 text-[#7C0116]"
                              )}>
                                {isBooked ? "Reservada" : disabled ? "No disponible" : "Reservar"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                      {classesForDay(day).length === 0 && (
                        <div className="rounded-2xl border border-dashed border-[#7C0116]/14 p-5 text-center">
                          <p className="text-xs font-semibold text-[#5C0110]/52">Sin clases</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </section>

          {/* Legend — solo estados, no categorías (VARRE24 ofrece un único método) */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={12} /> Reservada
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#7C0116]/15 bg-white/55 px-3 py-1.5 text-xs font-semibold text-[#7C0116]">
              <CalendarDays size={12} /> Disponible
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#7C0116]/10 bg-[#7C0116]/[0.04] px-3 py-1.5 text-xs font-semibold text-[#5C0110]/55">
              <Lock size={11} /> No disponible
            </div>
          </div>
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default BookClasses;
