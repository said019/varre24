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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MembershipCard } from "@/components/MembershipCard";
import { Calendar, ClipboardList, Stethoscope, Clock, CalendarCheck, ShoppingBag, ArrowRight, Sparkles, Upload, CreditCard } from "lucide-react";
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

  // Prefetch de las clases de la semana en curso: cuando la alumna entra al
  // dashboard, en background se traen las clases para que al tocar "Reservar"
  // el calendario aparezca instantáneo en vez de esperar ~1-3s.
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
    .slice(0, 2);

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

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-7xl space-y-6">

          {/* ── Greeting ── */}
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.45fr)]">
            <div className="relative overflow-hidden rounded-[1.75rem] bg-[#7C0116] p-6 text-[#FFF7F8] shadow-[0_30px_90px_-58px_rgba(47,40,35,0.95)] sm:p-8">
              <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgba(200,183,158,0.16))]" />
              <p className="relative text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#E7C9CF]">Bienvenida</p>
              <div className="relative mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h1 className="font-alilato text-4xl font-bold leading-[0.95] tracking-[0] text-[#FFF7F8] sm:text-5xl">
                    Hola, {firstName || "Cristopher"}
                  </h1>
                  <p className="mt-4 max-w-[58ch] text-sm leading-6 text-[#FFF1F3]/68">
                    Tu resumen de clases, membresía y pendientes del estudio para hoy.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:min-w-[24rem]">
                  {[
                    { to: "/app/classes", icon: Calendar, label: "Reservar" },
                    { to: "/app/bookings", icon: ClipboardList, label: "Reservas" },
                    { to: "/app/checkout", icon: ShoppingBag, label: "Planes" },
                  ].map(({ to, icon: Icon, label }) => (
                    <Link
                      key={to}
                      to={to}
                      className="group flex min-h-[6.8rem] flex-col justify-between rounded-2xl border border-[#FFF1F3]/12 bg-[#FFF1F3]/8 p-3 no-underline transition-all hover:-translate-y-0.5 hover:bg-[#FFF1F3]/12"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1F3]/12 text-[#FFF7F8]">
                        <Icon size={18} />
                      </span>
                      <span className="flex items-center justify-between text-xs font-semibold text-[#FFF1F3]/78">
                        {label}
                        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <aside className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {[
                { label: "Membresía", value: membershipName, loading: loadingMembership },
                { label: "Créditos", value: creditsLabel, loading: loadingMembership },
                { label: "Próximas", value: `${upcomingBookings.length}`, loading: loadingBookings },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[1.35rem] border border-[#7C0116]/12 bg-white/58 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_18px_50px_-38px_rgba(84,67,49,0.58)] backdrop-blur">
                  <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[#7C0116]/48">{stat.label}</p>
                  {/* Gate en loading: evita el parpadeo de "Sin membresía" / "Sin
                      plan activo" antes de que /memberships/my responda en el
                      primer render (cache fría / recarga). */}
                  {stat.loading ? (
                    <Skeleton className="mt-3 h-7 w-24" />
                  ) : (
                    <p className="mt-3 truncate text-xl font-bold text-[#2B0911]">{stat.value}</p>
                  )}
                </div>
              ))}
            </aside>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div className="space-y-6">
              {/* ── Membresía ── */}
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#7C0116]/52">Mi membresía</p>
                  <Link to="/app/checkout" className="text-xs font-semibold text-[#7C0116] no-underline hover:text-[#2B0911]">
                    Ver planes
                  </Link>
                </div>
                {loadingMembership ? (
                  <Skeleton className="h-44 w-full rounded-[1.35rem]" />
                ) : membership ? (
                  <MembershipCard membership={membership} />
                ) : (
                  <div className="rounded-[1.35rem] border border-[#7C0116]/14 bg-white/54 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_22px_60px_-42px_rgba(84,67,49,0.58)]">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-lg font-bold text-[#2B0911]">No tienes membresía activa</p>
                        <p className="mt-1 max-w-[48ch] text-sm text-[#5C0110]/62">
                          Elige un plan para reservar clases y ver tus créditos disponibles.
                        </p>
                      </div>
                      <Button asChild className="bg-[#7C0116] text-[#FFF1F3] hover:bg-[#670626]">
                        <Link to="/app/checkout">Adquirir membresía</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Próximas clases ── */}
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#7C0116]/52">Próximas clases</p>
                  <Link to="/app/classes" className="text-xs font-semibold text-[#7C0116] no-underline hover:text-[#2B0911]">
                    Reservar
                  </Link>
                </div>
                {loadingBookings ? (
                  <Skeleton className="h-32 w-full rounded-[1.35rem]" />
                ) : upcomingBookings.length === 0 ? (
                  <div className="rounded-[1.35rem] border border-dashed border-[#7C0116]/18 bg-[#7C0116]/[0.035] p-8 text-center">
                    <p className="text-base font-semibold text-[#2B0911]">No tienes clases próximas</p>
                    <p className="mt-1 text-sm text-[#5C0110]/58">Reserva desde el calendario semanal del estudio.</p>
                    <Button asChild className="mt-5 bg-[#7C0116] text-[#FFF1F3] hover:bg-[#670626]">
                      <Link to="/app/classes">Reservar ahora</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {upcomingBookings.map((b) => (
                      <div key={b.id} className="rounded-[1.15rem] border border-[#7C0116]/12 bg-white/58 p-4 shadow-[0_18px_48px_-38px_rgba(84,67,49,0.5)]">
                        <div className="flex items-center gap-4">
                          <div className="shrink-0 rounded-2xl bg-[#7C0116] px-3 py-2 text-center text-[#FFF7F8]">
                            <p className="tabular text-lg font-bold leading-none">
                              {b.start_time ? format(safeParse(b.start_time), "HH:mm") : "—"}
                            </p>
                            <p className="mt-1 text-[10px] capitalize text-[#FFF1F3]/65">
                              {b.start_time ? format(safeParse(b.start_time), "EEE d", { locale: es }) : ""}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-[#2B0911]">{b.class_type_name}</p>
                            <p className="mt-0.5 truncate text-xs text-[#5C0110]/58">{b.instructor_name ?? b.class_type_name}</p>
                          </div>
                          <Badge
                            className={b.status === "waitlist"
                              ? "border border-[#E7C9CF]/40 bg-[#E7C9CF]/20 text-[#7C0116]"
                              : "bg-[#7C0116] text-[#FFF1F3]"}
                          >
                            {b.status === "waitlist" ? "Espera" : "Confirmada"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-6">
              {/* ── CTA Adquirir / Renovar ── */}
              {(noMembership || isLowCredits) && (
                <Link to="/app/checkout" className="block no-underline">
                  <div className="relative overflow-hidden rounded-[1.35rem] border border-[#7C0116]/14 bg-white/58 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_22px_60px_-42px_rgba(84,67,49,0.64)] transition-all hover:-translate-y-0.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C0116]/10 text-[#7C0116]">
                          <Sparkles size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-[#2B0911]">
                            {noMembership ? "Adquiere tu membresía" : "Renueva tu plan"}
                          </p>
                          <p className="mt-0.5 text-xs text-[#5C0110]/58">
                            {noMembership
                              ? "Elige el plan ideal para ti"
                              : `${classesRemaining} clase${classesRemaining === 1 ? "" : "s"} restantes`}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="shrink-0 text-[#7C0116]" />
                    </div>
                  </div>
                </Link>
              )}

              {/* ── Órdenes pendientes ── */}
              {pendingOrders.length > 0 && (
                <div>
                  <p className="mb-3 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#7C0116]/52">
                    <CreditCard size={12} />
                    {pendingOrders.length === 1 ? "Orden pendiente" : "Órdenes pendientes"}
                  </p>
                  <div className="space-y-3">
                    {pendingOrders.map((o: any) => (
                      <div key={o.id} className="rounded-[1.15rem] border border-[#7C0116]/12 bg-white/60 p-4 shadow-[0_18px_48px_-38px_rgba(84,67,49,0.5)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <p className="font-bold text-sm text-[#2B0911]">{o.plan_name}</p>
                            <p className="text-xs text-[#5C0110]/58">
                              ${Number(o.total_amount).toLocaleString("es-MX")} MXN · {o.payment_method === "card" ? "Tarjeta en línea" : o.payment_method === "cash" ? "Tarjeta (estudio)" : "Transferencia"}
                            </p>
                            {o.order_number && (
                              <p className="font-mono text-[10px] text-[#7C0116]/50">Orden: {o.order_number}</p>
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
                          <Button asChild size="sm" className="mt-3 w-full bg-[#7C0116] text-[#FFF1F3] hover:bg-[#670626]">
                            {o.payment_method === "card" ? (
                              <Link to="/app/orders">
                                <CreditCard size={13} className="mr-1.5" />Completar pago
                              </Link>
                            ) : (
                              <Link to={`/app/checkout?orderId=${o.id}`}>
                                <Upload size={13} className="mr-1.5" />Subir comprobante
                              </Link>
                            )}
                          </Button>
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
                </div>
              )}

              {/* ── Consultas pendientes ── */}
              {consultations.length > 0 && (
                <div>
                  <p className="mb-3 flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-amber-700/60">
                    <Stethoscope size={12} />
                    Consulta pendiente
                  </p>
                  <div className="space-y-3">
                    {consultations.map((c) => (
                      <div key={c.id} className="rounded-[1.15rem] border border-amber-300/35 bg-amber-50/55 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <p className="font-bold text-sm text-[#2B0911]">{c.complement_name}</p>
                            <p className="text-xs text-[#5C0110]/58">Especialista: {c.specialist}</p>
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
                          <p className="mt-3 rounded-xl bg-amber-100/60 px-3 py-2 text-xs text-amber-700">
                            Te contactaremos para agendar.
                          </p>
                        )}
                        {c.notes && (
                          <p className="mt-2 text-xs italic text-[#5C0110]/45">Nota: {c.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </section>

        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Dashboard;
