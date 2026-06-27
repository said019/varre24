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
import { MembershipCard } from "@/components/MembershipCard";
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
    { to: "/app/classes", icon: Calendar, label: "Reservar clase" },
    { to: "/app/bookings", icon: ClipboardList, label: "Mis reservas" },
    { to: "/app/checkout", icon: ShoppingBag, label: "Comprar plan" },
  ];

  const SUMMARY = [
    { label: "Membresía", value: membershipName, loading: loadingMembership },
    { label: "Créditos", value: creditsLabel, loading: loadingMembership },
    { label: "Próximas", value: `${upcomingBookings.length}`, loading: loadingBookings },
  ];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-3xl px-1 py-4 sm:py-8 space-y-12">

          {/* ── Saludo editorial ── */}
          <section>
            <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B] first-letter:uppercase">
              {todayLabel}
            </p>
            <h1 className="font-bebas mt-3 text-[clamp(2.2rem,5vw,3.2rem)] font-light leading-[1.05] tracking-[0.01em] text-[#1A060B]">
              Hola{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="font-alilato mt-3 text-sm text-[#3B0E1A]/75">
              Tu resumen de clases y membresía en VARRE24.
            </p>
          </section>

          {/* ── Resumen — fila con hairlines ── */}
          <section className="grid grid-cols-3 border-y border-[#E8D7D6]">
            {SUMMARY.map((s, i) => (
              <div key={s.label} className={`py-5 pr-4 ${i > 0 ? "border-l border-[#E8D7D6] pl-4 sm:pl-6" : ""}`}>
                <p className="font-alilato text-[0.6rem] uppercase tracking-[0.2em] text-[#9C8A8B]">{s.label}</p>
                {s.loading
                  ? <Skeleton className="mt-2.5 h-5 w-16" />
                  : <p className="font-alilato mt-2.5 truncate text-[0.95rem] font-medium text-[#1A060B]">{s.value}</p>}
              </div>
            ))}
          </section>

          {/* ── Acciones rápidas ── */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {QUICK.map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center justify-between rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] px-5 py-4 no-underline transition-colors hover:border-[#3B0E1A]/45"
              >
                <span className="flex items-center gap-3">
                  <Icon size={17} className="text-[#3B0E1A]" strokeWidth={1.75} />
                  <span className="font-alilato text-sm text-[#1A060B]">{label}</span>
                </span>
                <ArrowRight size={14} className="text-[#9C8A8B] transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </section>

          {/* ── Mi membresía ── */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <p className="font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#9C8A8B]">Mi membresía</p>
              <Link to="/app/checkout" className="font-alilato text-xs text-[#3B0E1A] no-underline hover:underline underline-offset-4">Ver planes</Link>
            </div>
            {loadingMembership ? (
              <Skeleton className="h-44 w-full rounded-2xl" />
            ) : membership ? (
              <MembershipCard membership={membership} />
            ) : (
              <div className="flex flex-col gap-5 rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-alilato text-base font-medium text-[#1A060B]">No tienes membresía activa</p>
                  <p className="font-alilato mt-1 max-w-[48ch] text-sm text-[#3B0E1A]/70">
                    Elige un plan para reservar clases y ver tus créditos.
                  </p>
                </div>
                <Link
                  to="/app/checkout"
                  className="press inline-flex w-fit shrink-0 items-center justify-center rounded-full bg-[#3B0E1A] px-6 py-3 text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] no-underline transition-colors hover:bg-[#320C16]"
                >
                  Adquirir membresía
                </Link>
              </div>
            )}
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
