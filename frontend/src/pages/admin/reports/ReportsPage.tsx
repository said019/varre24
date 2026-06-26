import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

// Rango por defecto: del día 1 del mes actual a hoy (hora local del navegador).
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthStartStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/* ───────────────────────── tipos ───────────────────────── */
type OverviewData = {
  activeMembers: number;
  monthlyRevenue: number;
  monthlyBookings: number;
  monthlyAttended: number;
  monthlyNoShows: number;
  upcomingClasses: number;
  classOccupancyRate: number | null;
  classesBookedPast: number;
  newMembersThisMonth: number;
  reviewsTotal: number;
  reviewsPending: number;
  reviewsThisMonth: number;
  reviewsAverage: number;
};
type RevenueRow = { month: string; amount: number | string; count: number | string };
type ClassRow = {
  name: string;
  classesTotal: number;
  classesUpcoming: number;
  classesDone: number;
  bookings: number;
  attended: number;
  noShows: number;
  cancelled: number;
};
type InstructorRow = {
  id: string;
  name: string;
  classesUpcoming: number;
  classesDone: number;
  uniqueStudents: number;
  attended: number;
};
type RetentionData = { total: number; newThisMonth: number };

/* ───────────────────────── helpers ───────────────────────── */
const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: any) => Number(v ?? 0);
const money = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
// El backend devuelve el mes como "2026-05-01T00:00:00.000Z" (medianoche UTC
// del día 1). NO debe parsearse con new Date() y reformatearse en la zona del
// navegador: en México (UTC-6) la medianoche UTC del 1-may cae el 30-abr, así
// que cada mes se mostraba corrido uno hacia atrás ("abril" en vez de "mayo").
// Tomamos solo año-mes del string y construimos la fecha en hora local.
const monthDateFromRaw = (raw: any): Date | null => {
  if (raw == null) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})/);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // mes - 1 (0-indexado), día 1, mediodía local para evitar bordes de DST.
  return new Date(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0);
};
const fmtMonthLong = (raw: any) => {
  const d = monthDateFromRaw(raw);
  if (!d) return String(raw ?? "—");
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(d);
};
const fmtMonthShort = (raw: any) => {
  const d = monthDateFromRaw(raw);
  if (!d) return String(raw ?? "—");
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" })
    .format(d)
    .replace(".", "");
};

const ReportsPage = () => {
  const { data: overviewRes, isLoading: loadingOverview } = useQuery({
    queryKey: ["reports-overview"],
    queryFn: async () => (await api.get("/reports/overview")).data,
  });
  const { data: revenueRes } = useQuery({
    queryKey: ["reports-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
  });
  const { data: classesRes } = useQuery({
    queryKey: ["reports-classes"],
    queryFn: async () => (await api.get("/reports/classes")).data,
  });
  const { data: instructorsRes } = useQuery({
    queryKey: ["reports-instructors"],
    queryFn: async () => (await api.get("/reports/instructors")).data,
  });
  const { data: retentionRes } = useQuery({
    queryKey: ["reports-retention"],
    queryFn: async () => (await api.get("/reports/retention")).data,
  });

  // ── Filtro por rango de fechas + detalle de órdenes ──
  const [rangeStart, setRangeStart] = useState(monthStartStr());
  const [rangeEnd, setRangeEnd] = useState(todayStr());
  const validRange = !!rangeStart && !!rangeEnd && rangeStart <= rangeEnd;
  const { data: detailRes, isFetching: loadingDetail } = useQuery({
    queryKey: ["reports-orders", rangeStart, rangeEnd],
    queryFn: async () =>
      (await api.get(`/reports/orders?start=${rangeStart}&end=${rangeEnd}`)).data,
    enabled: validRange,
  });
  const detail = (detailRes?.data ?? detailRes ?? {}) as {
    orders?: any[]; total?: number; count?: number;
  };
  const detailOrders = safeArray<any>(detail.orders);
  const paymentLabel = (m: string) =>
    m === "card" ? "Tarjeta (en línea)"
      : m === "cash" ? "Tarjeta (en estudio)"
      : m === "transfer" ? "Transferencia" : (m || "—");
  const fmtDateTime = (raw: any) => {
    const d = new Date(raw);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const overview = (overviewRes?.data ?? overviewRes ?? {}) as Partial<OverviewData>;
  const retention = (retentionRes?.data ?? retentionRes ?? {}) as Partial<RetentionData>;

  const revenueRowsRaw = safeArray<RevenueRow>(revenueRes?.data ?? revenueRes);
  const revenueRows = revenueRowsRaw.map((r) => ({
    monthStart: r.month,
    label: fmtMonthLong(r.month),
    short: fmtMonthShort(r.month),
    amount: n(r.amount),
    count: n(r.count),
  }));
  const totalRevenue = revenueRows.reduce((s, x) => s + x.amount, 0);
  const totalOrders = revenueRows.reduce((s, x) => s + x.count, 0);
  const maxAmount = Math.max(0, ...revenueRows.map((x) => x.amount));
  const activeMonths = revenueRows.filter((x) => x.amount > 0 || x.count > 0);
  const idleMonths = revenueRows.length - activeMonths.length;

  const current = revenueRows[revenueRows.length - 1];
  const previous = revenueRows.length >= 2 ? revenueRows[revenueRows.length - 2] : undefined;
  const delta =
    previous && previous.amount > 0
      ? ((current.amount - previous.amount) / previous.amount) * 100
      : null;

  const classRows = safeArray<ClassRow>(classesRes?.data ?? classesRes);
  const instructorRows = safeArray<InstructorRow>(instructorsRes?.data ?? instructorsRes);

  const currentMonthLabel = current ? current.label : fmtMonthLong(new Date());
  const previousShort = previous ? previous.short : "—";

  /* ───── bricks ───── */

  const DeltaBadge = ({ pct }: { pct: number | null }) => {
    if (pct == null) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#5B4A3E]/10 px-2.5 py-1 text-[11px] font-medium text-[#3A2F26]">
          <Minus size={11} /> sin comparación
        </span>
      );
    }
    const up = pct >= 0;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
          up ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
        }`}
      >
        {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {up ? "+" : ""}
        {pct.toFixed(1)}% vs {previousShort}
      </span>
    );
  };

  const Stat = ({
    label,
    value,
    hint,
    accent = "#5B4A3E",
  }: {
    label: string;
    value: React.ReactNode;
    hint?: string;
    accent?: string;
  }) => (
    <div className="flex flex-col gap-1 py-3 px-4 rounded-xl bg-[#FBF8F4] border border-[#5B4A3E]/12">
      <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#3A2F26]/65">
        <span className="h-[3px] w-3 rounded-full" style={{ background: accent }} />
        {label}
      </div>
      {loadingOverview ? (
        <Skeleton className="h-6 w-20 mt-1" />
      ) : (
        <div className="text-[1.35rem] leading-tight font-bold text-[#2A211B] tabular-nums">{value}</div>
      )}
      {hint && <div className="text-[11px] text-[#3A2F26]/70 leading-snug">{hint}</div>}
    </div>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl space-y-8">
          {/* ── HEADER ── */}
          <header className="flex flex-col gap-1">
            <h1 className="font-bebas text-3xl tracking-tight text-[#2A211B]">Reportes</h1>
            <p className="text-[12px] text-[#3A2F26]/70">
              Periodo en curso:{" "}
              <span className="font-semibold text-[#3A2F26] capitalize">{currentMonthLabel}</span>
              {" · "}ventana histórica de 12 meses
            </p>
          </header>

          {/* ── INGRESOS DEL MES — destacado ── */}
          <Card className="border-t-2 overflow-hidden" style={{ borderTopColor: "#5B4A3E" }}>
            <CardHeader className="pb-2">
              <CardTitle className="font-alilato text-sm font-semibold text-[#3A2F26]/70 uppercase tracking-[0.14em]">
                Ingresos del mes
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {loadingOverview ? (
                <Skeleton className="h-10 w-48" />
              ) : (
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <div className="font-bebas text-[3.2rem] leading-none text-[#2A211B] tabular-nums">
                    {money(n(overview.monthlyRevenue))}
                  </div>
                  <DeltaBadge pct={delta} />
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat
                  label="Reservas"
                  accent="#8A8077"
                  value={n(overview.monthlyBookings)}
                  hint={
                    n(overview.monthlyBookings) > 0
                      ? `${n(overview.monthlyAttended)} asistidas · ${n(overview.monthlyNoShows)} no-show`
                      : "Sin reservas activas en clases de este mes"
                  }
                />
                <Stat
                  label="Ocupación"
                  accent="#3A2F26"
                  value={
                    overview.classOccupancyRate == null
                      ? "—"
                      : `${overview.classOccupancyRate}%`
                  }
                  hint={
                    overview.classOccupancyRate == null
                      ? "Aún no hay clases impartidas"
                      : `Asistidas / reservadas en ${n(overview.classesBookedPast)} clases ya dadas`
                  }
                />
                <Stat
                  label="Nuevas alumnas"
                  accent="#8A8077"
                  value={n(overview.newMembersThisMonth)}
                  hint={`Total clientas: ${n(retention.total)}`}
                />
                <Stat
                  label="Clases próximas"
                  accent="#D5C4B8"
                  value={n(overview.upcomingClasses)}
                  hint="Programadas a partir de hoy"
                />
              </div>

              {/* línea densa de secundarios */}
              <dl className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-[#3A2F26]/85">
                <div className="flex items-center gap-1.5">
                  <dt className="uppercase tracking-[0.14em] text-[10px] text-[#3A2F26]/55">Alumnas activas</dt>
                  <dd className="font-semibold tabular-nums text-[#2A211B]">{n(overview.activeMembers)}</dd>
                </div>
                <span className="h-3 w-px bg-[#5B4A3E]/15" />
                <div className="flex items-center gap-1.5">
                  <dt className="uppercase tracking-[0.14em] text-[10px] text-[#3A2F26]/55">Reseñas</dt>
                  <dd className="font-semibold tabular-nums text-[#2A211B]">{n(overview.reviewsTotal)}</dd>
                  {n(overview.reviewsPending) > 0 && (
                    <span className="text-[10px] text-amber-700 font-medium">
                      ({n(overview.reviewsPending)} pendientes)
                    </span>
                  )}
                </div>
                <span className="h-3 w-px bg-[#5B4A3E]/15" />
                <div className="flex items-center gap-1.5">
                  <dt className="uppercase tracking-[0.14em] text-[10px] text-[#3A2F26]/55">Calificación general</dt>
                  <dd className="font-semibold tabular-nums text-[#2A211B]">
                    {overview.reviewsAverage ? `${overview.reviewsAverage} ★` : "—"}
                  </dd>
                </div>
                {n(overview.reviewsThisMonth) > 0 && (
                  <>
                    <span className="h-3 w-px bg-[#5B4A3E]/15" />
                    <div className="flex items-center gap-1.5">
                      <dt className="uppercase tracking-[0.14em] text-[10px] text-[#3A2F26]/55">Reseñas este mes</dt>
                      <dd className="font-semibold tabular-nums text-[#2A211B]">{n(overview.reviewsThisMonth)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* ── DETALLE POR RANGO DE FECHAS ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-alilato text-sm font-semibold text-[#3A2F26]/70 uppercase tracking-[0.14em]">
                Detalle por fechas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#3A2F26]/70">Desde</label>
                  <DatePicker value={rangeStart} onChange={setRangeStart} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#3A2F26]/70">Hasta</label>
                  <DatePicker value={rangeEnd} onChange={setRangeEnd} min={rangeStart} />
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#3A2F26]/65">
                    Total del período
                  </div>
                  <div className="text-[1.35rem] leading-tight font-bold text-[#2A211B] tabular-nums">
                    {loadingDetail
                      ? <Loader2 size={18} className="animate-spin inline" />
                      : money(n(detail.total))}
                  </div>
                  <div className="text-[11px] text-[#3A2F26]/70">
                    {n(detail.count)} orden{n(detail.count) === 1 ? "" : "es"} aprobada{n(detail.count) === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              {!validRange && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  La fecha "Desde" no puede ser posterior a "Hasta".
                </p>
              )}

              {validRange && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] tracking-[0.14em] uppercase text-[#3A2F26]/60 border-b border-[#5B4A3E]/15">
                        <th className="text-left font-semibold py-2 pr-3">Fecha</th>
                        <th className="text-left font-semibold py-2 pr-3">Cliente</th>
                        <th className="text-left font-semibold py-2 pr-3">Plan</th>
                        <th className="text-left font-semibold py-2 pr-3">Método</th>
                        <th className="text-right font-semibold py-2">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingDetail ? (
                        <tr><td colSpan={5} className="py-6 text-center text-[#3A2F26]/60">
                          <Loader2 size={16} className="animate-spin inline mr-2" />Cargando…
                        </td></tr>
                      ) : detailOrders.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-[#3A2F26]/60">
                          No hay órdenes aprobadas en este período.
                        </td></tr>
                      ) : (
                        detailOrders.map((o) => (
                          <tr key={o.id} className="border-b border-[#5B4A3E]/8 last:border-0">
                            <td className="py-2.5 pr-3 text-[#3A2F26] whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-[#2A211B]">{o.client_name || "—"}</div>
                              <div className="text-[11px] text-[#3A2F26]/60">{o.client_email}</div>
                            </td>
                            <td className="py-2.5 pr-3 text-[#3A2F26]">{o.plan_name || "—"}</td>
                            <td className="py-2.5 pr-3 text-[#3A2F26]">{paymentLabel(o.payment_method)}</td>
                            <td className="py-2.5 text-right font-semibold text-[#2A211B] tabular-nums">{money(n(o.total_amount))}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── INGRESOS POR MES — tabla con barras inline ── */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-end justify-between gap-4">
              <div>
                <CardTitle className="font-alilato text-sm font-semibold text-[#3A2F26]/70 uppercase tracking-[0.14em]">
                  Ingresos por mes
                </CardTitle>
                <p className="text-[11px] text-[#3A2F26]/55 mt-0.5">
                  Últimos 12 meses, solo meses con movimiento
                </p>
              </div>
              <div className="flex items-center gap-5 text-right">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#3A2F26]/55 font-semibold">Total 12m</p>
                  <p className="font-bebas text-2xl text-[#2A211B] tabular-nums leading-none mt-0.5">
                    {money(totalRevenue)}
                  </p>
                </div>
                <div className="border-l border-[#5B4A3E]/15 pl-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#3A2F26]/55 font-semibold">Órdenes</p>
                  <p className="font-bebas text-2xl text-[#2A211B] tabular-nums leading-none mt-0.5">{totalOrders}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeMonths.length === 0 ? (
                <p className="text-sm text-[#3A2F26]/70 py-8 text-center italic">
                  Aún no hay ingresos registrados en los últimos 12 meses.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-[#5B4A3E]/10">
                    {[...activeMonths].reverse().map((row) => {
                      const pct = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0;
                      const isCurrent = current && row.monthStart === current.monthStart;
                      return (
                        <li key={row.monthStart} className="py-3 flex items-center gap-4">
                          <div className="w-32 shrink-0">
                            <p className="text-[13px] font-medium text-[#2A211B] capitalize leading-tight">
                              {row.label}
                            </p>
                            {isCurrent && (
                              <p className="text-[10px] uppercase tracking-[0.16em] text-[#5B4A3E] font-semibold">
                                en curso
                              </p>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="h-2 rounded-full bg-[#5B4A3E]/8 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-[width] duration-700"
                                style={{
                                  width: `${pct}%`,
                                  background: isCurrent ? "#5B4A3E" : "#D5C4B8",
                                }}
                              />
                            </div>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <p className="text-[14px] font-bold text-[#2A211B]">{money(row.amount)}</p>
                            <p className="text-[11px] text-[#3A2F26]/65">
                              {row.count} orden{row.count !== 1 ? "es" : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {idleMonths > 0 && (
                    <p className="mt-4 text-[11px] text-[#3A2F26]/55 italic">
                      Otros {idleMonths} meses sin movimientos.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ── DESEMPEÑO POR CLASE ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-alilato text-sm font-semibold text-[#3A2F26]/70 uppercase tracking-[0.14em]">
                Desempeño por tipo de clase
              </CardTitle>
              <p className="text-[11px] text-[#3A2F26]/55 mt-0.5">Datos acumulados, todas las fechas</p>
            </CardHeader>
            <CardContent>
              {classRows.length === 0 ? (
                <p className="text-sm text-[#3A2F26]/70 py-8 text-center italic">Sin clases registradas aún.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#5B4A3E]/15 text-[10px] uppercase tracking-[0.14em] text-[#3A2F26]/65 font-semibold">
                        <th className="text-left py-2.5 pr-4">Clase</th>
                        <th className="text-right py-2.5 px-3">Próximas</th>
                        <th className="text-right py-2.5 px-3">Impartidas</th>
                        <th className="text-right py-2.5 px-3">Reservas</th>
                        <th className="text-right py-2.5 px-3">Asistidas</th>
                        <th className="text-right py-2.5 px-3">% asist.</th>
                        <th className="text-right py-2.5 pl-3">Canceladas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classRows.map((c) => {
                        const rate = c.bookings > 0 ? Math.round((c.attended / c.bookings) * 100) : null;
                        return (
                          <tr key={c.name} className="border-b border-[#5B4A3E]/10 last:border-0">
                            <td className="py-3 pr-4 font-medium text-[#2A211B]">{c.name}</td>
                            <td className="text-right tabular-nums px-3 text-[#3A2F26]">{c.classesUpcoming}</td>
                            <td className="text-right tabular-nums px-3 text-[#3A2F26]">{c.classesDone}</td>
                            <td className="text-right tabular-nums px-3 font-semibold text-[#2A211B]">{c.bookings}</td>
                            <td className="text-right tabular-nums px-3 text-[#3A2F26]">{c.attended}</td>
                            <td className="text-right tabular-nums px-3">
                              {rate == null ? (
                                <span className="text-[#3A2F26]/45">—</span>
                              ) : (
                                <span
                                  className={
                                    rate >= 80
                                      ? "text-emerald-700 font-semibold"
                                      : rate >= 50
                                        ? "text-[#5B4A3E] font-semibold"
                                        : "text-amber-700 font-semibold"
                                  }
                                >
                                  {rate}%
                                </span>
                              )}
                            </td>
                            <td className="text-right tabular-nums pl-3 text-[#3A2F26]/70">{c.cancelled}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-[#3A2F26]/45">
                    Reservas excluye canceladas · % asistencia = asistidas / reservas
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── INSTRUCTORAS ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-alilato text-sm font-semibold text-[#3A2F26]/70 uppercase tracking-[0.14em]">
                Instructoras
              </CardTitle>
              <p className="text-[11px] text-[#3A2F26]/55 mt-0.5">Solo instructoras activas</p>
            </CardHeader>
            <CardContent>
              {instructorRows.length === 0 ? (
                <p className="text-sm text-[#3A2F26]/70 py-8 text-center italic">Sin instructoras registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#5B4A3E]/15 text-[10px] uppercase tracking-[0.14em] text-[#3A2F26]/65 font-semibold">
                        <th className="text-left py-2.5 pr-4">Instructora</th>
                        <th className="text-right py-2.5 px-3">Impartidas</th>
                        <th className="text-right py-2.5 px-3">Próximas</th>
                        <th className="text-right py-2.5 px-3">Alumnas únicas</th>
                        <th className="text-right py-2.5 pl-3">Asistencias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructorRows.map((i) => (
                        <tr key={i.id} className="border-b border-[#5B4A3E]/10 last:border-0">
                          <td className="py-3 pr-4 font-medium text-[#2A211B]">{i.name}</td>
                          <td className="text-right tabular-nums px-3 font-semibold text-[#2A211B]">
                            {i.classesDone}
                          </td>
                          <td className="text-right tabular-nums px-3 text-[#3A2F26]">{i.classesUpcoming}</td>
                          <td className="text-right tabular-nums px-3 text-[#3A2F26]">{i.uniqueStudents}</td>
                          <td className="text-right tabular-nums pl-3 text-[#3A2F26]">{i.attended}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-[#3A2F26]/45">
                    Impartidas = completadas o ya pasadas · Alumnas únicas excluye reservas canceladas
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ReportsPage;
