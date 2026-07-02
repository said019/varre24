import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { es } from "date-fns/locale";
import { format, startOfWeek, endOfWeek } from "date-fns";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { safeParse } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ClipboardList, Stethoscope, Clock, CalendarCheck, ShoppingBag, ArrowRight, Upload, CreditCard } from "lucide-react";
import type { ClientMembership } from "@/types/membership";
import type { BookingClient } from "@/types/booking";

interface Consultation {
  id: string;
  complement_type: string;
  complement_name: string;
  specialist: string;
  status: "pending" | "scheduled";
  scheduled_date: string | null;
  notes: string | null;
  created_at: string;
}

const Dashboard = () => {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const { data: membershipData, isLoading: loadingMembership } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
    staleTime: 60_000,
  });

  const { data: bookingsData, isLoading: loadingBookings } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
    staleTime: 30_000,
  });

  // Prefetch de las clases de la semana en curso para que "Reservar" abra al instante.
  useEffect(() => {
    const today = new Date();
    const start = format(startOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd");
    const end = format(endOfWeek(today, { weekStartsOn: 0 }), "yyyy-MM-dd");
    qc.prefetchQuery({
      queryKey: ["public-classes", start],
      queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
      staleTime: 30_000,
    });
  }, [qc]);

  const { data: consultationsData } = useQuery({
    queryKey: ["my-consultations"],
    queryFn: async () => (await api.get("/consultations/my")).data,
  });

  const { data: ordersData } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await api.get("/orders")).data,
  });

  const pendingOrders: any[] = (Array.isArray(ordersData?.data) ? ordersData.data : [])
    .filter((o: any) => o.status === "pending_payment" || o.status === "pending_verification");

  const consultations: Consultation[] = Array.isArray(consultationsData?.data)
    ? consultationsData.data
    : Array.isArray(consultationsData) ? consultationsData : [];

  const rawMembership = membershipData?.data !== undefined ? membershipData.data : membershipData;
  const membership: ClientMembership | null =
    rawMembership && typeof rawMembership === "object" && "id" in rawMembership ? rawMembership : null;

  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];

  const upcomingBookings = bookings
    .filter((b) => b.status === "confirmed" || b.status === "waitlist")
    .slice(0, 3);

  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining ?? null;
  const isLowCredits = membership && classesRemaining !== null && classesRemaining <= 2;
  const noMembership = !loadingMembership && !membership;

  const firstName = (user?.displayName ?? user?.display_name ?? user?.email?.split("@")[0] ?? "").split(" ")[0];
  const membershipName = membership?.planName ?? membership?.plan_name ?? "Sin membresía";
  const creditsLabel = membership
    ? classesRemaining === null
      ? "Ilimitadas"
      : `${classesRemaining ?? 0} clases`
    : "Sin plan activo";
  const todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  const QUICK = [
    { to: "/app/classes", icon: Calendar, label: "Reservar clase", chip: "bg-[#FFD6E6]", ic: "text-[#3B0E1A]" },
    { to: "/app/bookings", icon: ClipboardList, label: "Mis reservas", chip: "bg-[#C9A5A8]/25", ic: "text-[#8A5A5E]" },
    { to: "/app/checkout", icon: ShoppingBag, label: "Comprar plan", chip: "bg-[#806248]/15", ic: "text-[#806248]" },
  ];

  const attended = bookings.filter((b) => b.status === "checked_in").length;
  const creditsBig = membership ? (classesRemaining === null ? "∞" : `${classesRemaining}`) : "—";
  const creditsCaption = membership
    ? classesRemaining === null
      ? "Clases ilimitadas"
      : `clase${classesRemaining === 1 ? "" : "s"} disponible${classesRemaining === 1 ? "" : "s"}`
    : "Sin plan activo";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-5xl px-1 py-4 sm:py-8 space-y-8">

          {/* ── Saludo ── */}
          <section>
            <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B] first-letter:uppercase">
              {todayLabel}
            </p>
            <h1 className="font-bebas mt-2 text-[clamp(2.2rem,5vw,3.2rem)] font-light leading-[1.04] tracking-[0.01em] text-[#1A060B]">
              Hola{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="font-alilato mt-1.5 text-sm text-[#3B0E1A]/70">
              Tu práctica en VARRE24, en un vistazo.
            </p>
          </section>

          {/* ── Bento principal: membresía (foco) + stats ── */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Panel destacado de membresía */}
            <div className="relative flex min-h-[252px] flex-col justify-between overflow-hidden rounded-[1.75rem] bg-[#3B0E1A] p-7 text-[#F3EFE9] transition-transform duration-300 hover:-translate-y-0.5 sm:p-8 lg:col-span-7">
              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#C9A5A8]/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-[#806248]/15 blur-3xl" />
              <div className="relative">
                <p className="font-alilato text-[0.64rem] uppercase tracking-[0.26em] text-[#E8D9DA]/65">Tu membresía</p>
                {loadingMembership ? (
                  <Skeleton className="mt-4 h-10 w-52 bg-[#F3EFE9]/10" />
                ) : membership ? (
                  <>
                    <h2 className="font-bebas mt-3 text-[clamp(1.9rem,3.4vw,2.7rem)] font-light leading-[1.04] text-[#F3EFE9]">
                      {membershipName}
                    </h2>
                    <p className="mt-4 flex items-baseline gap-2">
                      <span className="font-bebas text-[2.6rem] font-light leading-none text-[#F3EFE9]">{creditsBig}</span>
                      <span className="font-alilato text-xs uppercase tracking-[0.16em] text-[#E8D9DA]/70">{creditsCaption}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-bebas mt-3 text-[clamp(1.9rem,3.4vw,2.7rem)] font-light leading-[1.04] text-[#F3EFE9]">
                      Comienza tu práctica
                    </h2>
                    <p className="font-alilato mt-3 max-w-[44ch] text-sm leading-relaxed text-[#E8D9DA]/85">
                      Elige un plan para reservar Barre y Pilates y llevar el control de tus créditos.
                    </p>
                    <div className="mt-5 flex items-center gap-5">
                      <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#C9A5A8]" /><span className="font-alilato text-[0.66rem] uppercase tracking-[0.16em] text-[#E8D9DA]/75">Barre</span></span>
                      <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#C9A5A8]" /><span className="font-alilato text-[0.66rem] uppercase tracking-[0.16em] text-[#E8D9DA]/75">Pilates</span></span>
                    </div>
                  </>
                )}
              </div>
              <div className="relative mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link
                  to={membership ? "/app/classes" : "/app/checkout"}
                  className="press inline-flex items-center gap-2 rounded-full bg-[#FFD6E6] px-6 py-3 font-alilato text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#3B0E1A] no-underline transition-colors hover:bg-[#FFE4EE]"
                >
                  {membership ? "Reservar clase" : "Adquirir membresía"}
                  <ArrowRight size={14} />
                </Link>
                <Link to="/app/checkout" className="font-alilato text-[0.72rem] uppercase tracking-[0.14em] text-[#E8D9DA]/80 no-underline transition-colors hover:text-[#F3EFE9]">
                  Ver planes
                </Link>
              </div>
            </div>

            {/* Stats — columna derecha */}
            <div className="grid grid-cols-2 gap-4 lg:col-span-5 lg:grid-cols-1">
              <div className="flex flex-col justify-center rounded-[1.5rem] bg-[#FFD6E6] p-6 transition-transform duration-300 hover:-translate-y-0.5">
                <p className="font-alilato text-[0.6rem] uppercase tracking-[0.2em] text-[#8A5A5E]">Próximas reservas</p>
                {loadingBookings
                  ? <Skeleton className="mt-3 h-9 w-12 bg-[#FFE4EE]" />
                  : <p className="font-bebas mt-2 text-[2.4rem] font-light leading-none text-[#3B0E1A]">{upcomingBookings.length}</p>}
                <p className="font-alilato mt-1.5 text-xs text-[#3B0E1A]/60">clases agendadas</p>
              </div>
              <div className="flex flex-col justify-center rounded-[1.5rem] bg-[#3B0E1A] p-6 transition-transform duration-300 hover:-translate-y-0.5">
                <p className="font-alilato text-[0.6rem] uppercase tracking-[0.2em] text-[#FFD6E6]/70">Clases tomadas</p>
                {loadingBookings
                  ? <Skeleton className="mt-3 h-9 w-12 bg-[#F3EFE9]/10" />
                  : <p className="font-bebas mt-2 text-[2.4rem] font-light leading-none text-[#FFD6E6]">{attended}</p>}
                <p className="font-alilato mt-1.5 text-xs text-[#F3EFE9]/60">en tu historial</p>
              </div>
            </div>
          </section>

          {/* ── Acciones (barra agrupada, no 3 cards iguales) ── */}
          <section className="grid grid-cols-1 divide-y divide-[#E8D7D6] overflow-hidden rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {QUICK.map(({ to, icon: Icon, label, chip, ic }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center justify-between px-5 py-4 no-underline transition-colors hover:bg-[#FFE4EE]/50"
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${chip}`}>
                    <Icon size={16} className={ic} strokeWidth={1.75} />
                  </span>
                  <span className="font-alilato text-sm text-[#1A060B]">{label}</span>
                </span>
                <ArrowRight size={14} className="text-[#9C8A8B] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </section>

          {/* ── Próximas clases ── */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <p className="font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#9C8A8B]">Próximas clases</p>
              <Link to="/app/classes" className="font-alilato text-xs text-[#3B0E1A] no-underline hover:underline underline-offset-4">Reservar</Link>
            </div>
            {loadingBookings ? (
              <Skeleton className="h-24 w-full rounded-2xl" />
            ) : upcomingBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#E8D7D6] bg-[#FCF8F7] p-8 text-center">
                <p className="font-alilato text-sm font-medium text-[#1A060B]">No tienes clases próximas</p>
                <p className="font-alilato mt-1 text-sm text-[#3B0E1A]/60">Reserva desde el calendario semanal del estudio.</p>
                <Link
                  to="/app/classes"
                  className="press mt-5 inline-flex items-center justify-center rounded-full bg-[#3B0E1A] px-6 py-3 text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] no-underline transition-colors hover:bg-[#320C16]"
                >
                  Reservar ahora
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#E8D7D6] border-y border-[#E8D7D6]">
                {upcomingBookings.map((b) => (
                  <div key={b.id} className="flex items-center gap-4 py-4">
                    <div className="w-12 shrink-0 text-center">
                      <p className="font-bebas text-xl font-light leading-none tracking-tight text-[#1A060B] tabular">
                        {b.start_time ? format(safeParse(b.start_time), "HH:mm") : "—"}
                      </p>
                      <p className="font-alilato mt-1 text-[10px] uppercase tracking-wide text-[#9C8A8B]">
                        {b.start_time ? format(safeParse(b.start_time), "EEE d", { locale: es }) : ""}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-alilato truncate text-sm font-medium text-[#1A060B]">{b.class_type_name}</p>
                      <p className="font-alilato mt-0.5 truncate text-xs text-[#3B0E1A]/60">{b.instructor_name ?? b.class_type_name}</p>
                    </div>
                    <span
                      className={`font-alilato shrink-0 rounded-full px-3 py-1 text-[0.64rem] uppercase tracking-[0.1em] ${
                        b.status === "waitlist"
                          ? "border border-[#E8D7D6] text-[#9C8A8B]"
                          : "bg-[#3B0E1A] text-[#F3EFE9]"
                      }`}
                    >
                      {b.status === "waitlist" ? "Espera" : "Confirmada"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── CTA renovar (créditos bajos) ── */}
          {isLowCredits && membership && (
            <Link
              to="/app/checkout"
              className="flex items-center justify-between gap-4 rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] px-5 py-4 no-underline transition-colors hover:border-[#3B0E1A]/45"
            >
              <div>
                <p className="font-alilato text-sm font-medium text-[#1A060B]">Renueva tu plan</p>
                <p className="font-alilato mt-0.5 text-xs text-[#3B0E1A]/60">
                  {classesRemaining} clase{classesRemaining === 1 ? "" : "s"} restantes
                </p>
              </div>
              <ArrowRight size={15} className="shrink-0 text-[#3B0E1A]" />
            </Link>
          )}

          {/* ── Órdenes pendientes ── */}
          {pendingOrders.length > 0 && (
            <section>
              <p className="mb-4 flex items-center gap-1.5 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#9C8A8B]">
                <CreditCard size={12} strokeWidth={1.75} />
                {pendingOrders.length === 1 ? "Orden pendiente" : "Órdenes pendientes"}
              </p>
              <div className="space-y-3">
                {pendingOrders.map((o: any) => (
                  <div key={o.id} className="rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-alilato text-sm font-medium text-[#1A060B]">{o.plan_name}</p>
                        <p className="font-alilato text-xs text-[#3B0E1A]/60">
                          ${Number(o.total_amount).toLocaleString("es-MX")} MXN · {o.payment_method === "card" ? "Tarjeta en línea" : o.payment_method === "cash" ? "Tarjeta (estudio)" : "Transferencia"}
                        </p>
                        {o.order_number && (
                          <p className="font-mono text-[10px] text-[#9C8A8B]">Orden: {o.order_number}</p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={o.status === "pending_payment"
                          ? "border-amber-400/50 bg-amber-50 text-[10px] text-amber-700"
                          : "border-blue-400/50 bg-blue-50 text-[10px] text-blue-700"}
                      >
                        {o.status === "pending_payment" ? (
                          <><Upload size={10} className="mr-1" />{o.payment_method === "card" ? "Pagar" : "Subir"}</>
                        ) : (
                          <><Clock size={10} className="mr-1" />Revisión</>
                        )}
                      </Badge>
                    </div>
                    {o.status === "pending_payment" && (
                      <Link
                        to={o.payment_method === "card" ? "/app/orders" : `/app/checkout?orderId=${o.id}`}
                        className="press mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#3B0E1A] py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#F3EFE9] no-underline transition-colors hover:bg-[#320C16]"
                      >
                        {o.payment_method === "card"
                          ? <><CreditCard size={13} /> Completar pago</>
                          : <><Upload size={13} /> Subir comprobante</>}
                      </Link>
                    )}
                    {o.status === "pending_verification" && (
                      <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        {o.payment_method === "cash"
                          ? "Acércate a recepción para completar tu pago."
                          : "Tu comprobante está siendo revisado."}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Consultas pendientes ── */}
          {consultations.length > 0 && (
            <section>
              <p className="mb-4 flex items-center gap-1.5 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#9C8A8B]">
                <Stethoscope size={12} strokeWidth={1.75} />
                Consulta pendiente
              </p>
              <div className="space-y-3">
                {consultations.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-alilato text-sm font-medium text-[#1A060B]">{c.complement_name}</p>
                        <p className="font-alilato text-xs text-[#3B0E1A]/60">Especialista: {c.specialist}</p>
                        {c.status === "scheduled" && c.scheduled_date && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-green-700">
                            <CalendarCheck size={11} />
                            {format(new Date(c.scheduled_date), "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline"
                             className={c.status === "scheduled"
                               ? "border-green-400/50 bg-green-50 text-[10px] text-green-700"
                               : "border-amber-400/50 bg-amber-50 text-[10px] text-amber-700"}>
                        {c.status === "scheduled" ? "Agendada" : "Pendiente"}
                      </Badge>
                    </div>
                    {c.status === "pending" && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Te contactaremos para agendar.
                      </p>
                    )}
                    {c.notes && (
                      <p className="mt-2 font-alilato text-xs italic text-[#3B0E1A]/50">Nota: {c.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Dashboard;
