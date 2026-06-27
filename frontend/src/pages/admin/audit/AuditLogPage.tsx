import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, subDays, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { History, Search, ExternalLink, User, Filter } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  method: string;
  path: string;
  path_full: string | null;
  resource_id: string | null;
  status_code: number;
  payload: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

interface AdminOption {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  admins: AdminOption[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const METHOD_COLORS: Record<string, string> = {
  POST:   "bg-emerald-50 text-emerald-700 border-emerald-300/40",
  PUT:    "bg-blue-50 text-blue-700 border-blue-300/40",
  PATCH:  "bg-violet-50 text-violet-700 border-violet-300/40",
  DELETE: "bg-red-50 text-red-700 border-red-300/40",
};

// Traduce status HTTP a etiqueta humana
function statusLabel(status: number): string {
  if (status >= 200 && status < 300) return "Hecho";
  if (status === 304) return "Sin cambios";
  if (status === 400) return "Datos inválidos";
  if (status === 401 || status === 403) return "Sin permiso";
  if (status === 404) return "No encontrado";
  if (status === 409) return "Conflicto";
  if (status >= 500) return "Error";
  return String(status);
}

// Formatea fechas tipo YYYY-MM-DD a "18 de mayo" (sin recargar la lib de date-fns)
function prettyDate(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return value;
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(m[3], 10)} ${months[parseInt(m[2], 10) - 1]}`;
}

// Convierte (method, path, payload) a { title, detail } legibles para la admin.
// Si no cae en ningún patrón conocido, regresa el path crudo (con styling tenue).
function humanizeAction(
  method: string,
  rawPath: string,
  payload: Record<string, unknown> | null | undefined,
): { title: string; detail: string | null } {
  const path = rawPath || "";
  const p = payload || {};

  // ── CLASES ──
  if (method === "POST" && /\/admin\/classes\/duplicate-week$/.test(path)) {
    const w = p.weeksAhead ?? p.weeks_ahead;
    const src = p.sourceWeekStart ?? p.source_week_start;
    return {
      title: `Duplicó la semana ${w === 1 || w === "1" ? "a la siguiente" : `a las próximas ${w} semanas`}`,
      detail: src ? `Desde la semana del ${prettyDate(src)}` : null,
    };
  }
  if (method === "DELETE" && /\/admin\/classes\/force-range$/.test(path)) {
    const a = p.startDate ?? p.start_date;
    const b = p.endDate ?? p.end_date;
    return {
      title: "Eliminó varias clases (rango de fechas)",
      detail: a && b ? `Del ${prettyDate(a)} al ${prettyDate(b)}` : null,
    };
  }
  if (method === "DELETE" && /\/classes\/week$/.test(path)) {
    const a = p.startDate ?? p.start_date;
    const b = p.endDate ?? p.end_date;
    return {
      title: "Limpió la semana del calendario",
      detail: a && b ? `Del ${prettyDate(a)} al ${prettyDate(b)}` : null,
    };
  }
  if (method === "POST" && /\/(admin\/)?classes(?:\/generate)?$/.test(path)) {
    if (path.endsWith("/generate")) {
      return { title: "Generó clases en bloque", detail: p.startDate && p.endDate ? `Del ${prettyDate(p.startDate)} al ${prettyDate(p.endDate)}` : null };
    }
    return { title: "Creó una clase nueva", detail: typeof p.startTime === "string" ? `Inicio: ${p.startTime.replace("T", " a las ")}` : null };
  }
  if (method === "PUT" && /\/admin\/classes\/[^/]+$/.test(path)) {
    if (p.instructorId) return { title: "Cambió la instructora de una clase", detail: "Las alumnas reservadas reciben notificación automática" };
    if (p.status === "cancelled") return { title: "Canceló una clase", detail: null };
    return { title: "Editó una clase", detail: null };
  }
  if (method === "DELETE" && /\/admin\/classes\/[^/]+$/.test(path)) {
    return { title: "Eliminó una clase", detail: null };
  }
  if (method === "PUT" && /\/classes\/[^/]+\/cancel$/.test(path)) {
    return { title: "Canceló una clase", detail: null };
  }

  // ── INSTRUCTORAS ──
  if (method === "POST" && /\/admin\/instructors$/.test(path)) return { title: "Creó una instructora", detail: typeof p.displayName === "string" ? String(p.displayName) : null };
  if (method === "PUT"  && /\/admin\/instructors\/[^/]+$/.test(path)) return { title: "Editó una instructora", detail: typeof p.displayName === "string" ? String(p.displayName) : null };
  if (method === "DELETE" && /\/admin\/instructors\/[^/]+$/.test(path)) return { title: "Eliminó una instructora", detail: null };

  // ── PLANES / PAQUETES ──
  if (method === "POST" && /\/admin\/plans$/.test(path)) return { title: "Creó un paquete", detail: typeof p.name === "string" ? `"${p.name}"` : null };
  if (method === "PUT"  && /\/admin\/plans\/[^/]+$/.test(path)) {
    if (p.is_active === false) return { title: "Desactivó un paquete", detail: typeof p.name === "string" ? `"${p.name}"` : null };
    if (p.is_active === true)  return { title: "Activó un paquete", detail: typeof p.name === "string" ? `"${p.name}"` : null };
    return { title: "Editó un paquete", detail: typeof p.name === "string" ? `"${p.name}"` : null };
  }
  if (method === "DELETE" && /\/admin\/plans\/[^/]+$/.test(path)) return { title: "Eliminó un paquete", detail: null };

  // ── PAGOS / ORDERS ──
  if (method === "POST" && /\/admin\/orders\/[^/]+\/approve$/.test(path))  return { title: "Aprobó un pago", detail: null };
  if (method === "POST" && /\/admin\/orders\/[^/]+\/reject$/.test(path))   return { title: "Rechazó un pago", detail: typeof p.reason === "string" ? `Motivo: ${p.reason}` : null };
  if (method === "POST" && /\/admin\/orders\/[^/]+\/mark-no-show$/.test(path)) return { title: "Marcó como inasistencia", detail: null };
  if (method === "POST" && /\/admin\/orders\/[^/]+\/pay-with-card$/.test(path))  return { title: "Registró cobro con tarjeta", detail: null };

  // ── RESERVAS ──
  if (method === "PUT" && /\/bookings\/[^/]+\/check-in$/.test(path))  return { title: "Hizo check-in de una alumna", detail: null };
  if (method === "PUT" && /\/bookings\/[^/]+\/no-show$/.test(path))   return { title: "Marcó no-show de una reserva", detail: null };
  if (method === "DELETE" && /\/bookings\/[^/]+/.test(path))          return { title: "Canceló una reserva", detail: null };
  if (method === "POST" && /\/admin\/bookings\/walkin$/.test(path))   return { title: "Agregó una reserva walk-in", detail: null };

  // ── MEMBRESÍAS ──
  if (method === "POST" && /\/memberships$/.test(path))                       return { title: "Creó una membresía manual", detail: null };
  if (method === "PUT"  && /\/memberships\/[^/]+\/activate$/.test(path))      return { title: "Activó una membresía", detail: null };
  if (method === "PUT"  && /\/memberships\/[^/]+\/cancel$/.test(path))        return { title: "Canceló una membresía", detail: typeof p.reason === "string" ? `Motivo: ${p.reason}` : null };

  // ── CUPONES ──
  if (method === "POST" && /\/admin\/discount-codes$/.test(path))           return { title: "Creó un cupón de descuento", detail: typeof p.code === "string" ? `Código: ${p.code}` : null };
  if (method === "PUT"  && /\/admin\/discount-codes\/[^/]+$/.test(path))    return { title: "Editó un cupón", detail: null };
  if (method === "DELETE" && /\/admin\/discount-codes\/[^/]+$/.test(path))  return { title: "Eliminó un cupón", detail: null };

  // ── USUARIOS / CLIENTES ──
  if (method === "POST"   && /\/users$/.test(path))         return { title: "Creó un cliente nuevo", detail: typeof p.email === "string" ? String(p.email) : null };
  if (method === "PUT"    && /\/users\/[^/]+$/.test(path))  return { title: "Editó un cliente", detail: typeof p.displayName === "string" ? String(p.displayName) : null };
  if (method === "DELETE" && /\/users\/[^/]+$/.test(path))  return { title: "Eliminó un cliente", detail: null };

  // ── CONFIGURACIÓN ──
  if (method === "PUT" && /\/settings\/[^/]+$/.test(path)) {
    const key = path.split("/").pop() || "";
    const map: Record<string, string> = {
      general_settings: "Configuración general",
      cancellation_window: "Política de cancelación",
      notification_templates: "Plantillas de notificación",
      notification_settings: "Notificaciones (toggles)",
      policies_settings: "Políticas (Términos / Privacidad)",
      bank_info: "Datos bancarios",
      loyalty_config: "Programa de lealtad",
    };
    return { title: `Actualizó: ${map[key] || key}`, detail: null };
  }

  // ── PASSWORDS / CUENTA ──
  if (method === "POST" && /\/auth\/change-password$/.test(path)) return { title: "Cambió su contraseña", detail: null };

  // ── WHATSAPP / EVOLUTION ──
  if (method === "POST" && /\/evolution\/connect$/.test(path))     return { title: "Conectó WhatsApp del estudio", detail: null };
  if (method === "POST" && /\/evolution\/disconnect$/.test(path))  return { title: "Desconectó WhatsApp del estudio", detail: null };
  if (method === "POST" && /\/evolution\/send-test$/.test(path))   return { title: "Envió WhatsApp de prueba", detail: typeof p.phone === "string" ? `a ${p.phone}` : null };

  // Default: muestra method + recurso de manera más amable
  const resource = path.replace(/^\/api\//, "").replace(/\/+/g, " / ");
  const verbMap: Record<string, string> = { POST: "Creó", PUT: "Editó", PATCH: "Editó", DELETE: "Eliminó" };
  return { title: `${verbMap[method] || method} ${resource}`, detail: null };
}

function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) return "bg-emerald-50 text-emerald-700 border-emerald-300/40";
  if (status >= 300 && status < 400) return "bg-amber-50 text-amber-700 border-amber-300/40";
  if (status >= 400 && status < 500) return "bg-orange-50 text-orange-700 border-orange-300/40";
  return "bg-red-50 text-red-700 border-red-300/40";
}

function summarizePayload(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) return "";
  const keys = Object.keys(payload).slice(0, 4);
  return keys
    .map((k) => {
      const v = (payload as any)[k];
      let s: string;
      if (v === null || v === undefined) s = "—";
      else if (typeof v === "string") s = v.length > 30 ? v.slice(0, 30) + "…" : v;
      else if (typeof v === "object") s = "{…}";
      else s = String(v);
      return `${k}: ${s}`;
    })
    .join(" · ");
}

// Devuelve el link al detalle del recurso afectado, si lo podemos inferir del path
function resourceLink(entry: AuditEntry): { to: string; label: string } | null {
  const path = entry.path || "";
  const id = entry.resource_id;
  if (!id) return null;
  if (path.includes("/admin/orders/")) return { to: `/admin/payments`, label: "Ver pagos" };
  if (path.includes("/admin/bookings/") || path.includes("/bookings/")) return { to: `/admin/bookings`, label: "Ver reservas" };
  if (path.includes("/admin/users") || path === "/api/users" || path.includes("/users/")) return { to: `/admin/clients/${id}`, label: "Ver cliente" };
  if (path.includes("/admin/plans")) return { to: `/admin/plans`, label: "Ver planes" };
  if (path.includes("/admin/class-types") || path.includes("/admin/schedule")) return { to: `/admin/classes`, label: "Ver clases" };
  if (path.includes("/instructors/")) return { to: `/admin/classes`, label: "Ver instructoras" };
  if (path.includes("/admin/discount-codes") || path.includes("/discount-codes")) return { to: `/admin/settings`, label: "Ver cupones" };
  return null;
}

// Rango de fechas → from/to YYYY-MM-DD
function rangeToParams(range: string): { from?: string; to?: string } {
  const now = new Date();
  if (range === "today") {
    return { from: format(now, "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  }
  if (range === "7d") {
    return { from: format(subDays(now, 6), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  }
  if (range === "month") {
    return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  }
  return {};
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const [range, setRange] = useState<string>("7d");
  const [actor, setActor] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    const { from, to } = rangeToParams(range);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (actor) params.set("actor", actor);
    if (method) params.set("method", method);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", "200");
    return params.toString();
  }, [range, actor, method, q]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit-log", queryParams],
    queryFn: async () => (await api.get(`/admin/audit-log?${queryParams}`)).data as { data: AuditResponse },
    refetchInterval: 30_000,
  });

  const entries = data?.data?.entries ?? [];
  const admins = data?.data?.admins ?? [];

  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#1A060B] flex items-center gap-2">
                <History size={22} /> Auditoría
              </h1>
              <p className="text-sm text-[#320C16]">Quién hizo qué movimiento en el sistema.</p>
            </div>
            <div className="text-xs text-[#3B0E1A]/60">
              {entries.length} {entries.length === 1 ? "entrada" : "entradas"} · se refresca cada 30 s
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#3B0E1A]/15 bg-white/50 p-3">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[160px] text-sm"><SelectValue placeholder="Rango" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="7d">Últimos 7 días</SelectItem>
                <SelectItem value="month">Este mes</SelectItem>
                <SelectItem value="all">Todo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={actor || "all"} onValueChange={(v) => setActor(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[210px] text-sm"><SelectValue placeholder="Quién" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las admins</SelectItem>
                {admins.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.display_name || a.email} · <span className="opacity-60 text-[10px]">{a.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={method || "all"} onValueChange={(v) => setMethod(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px] text-sm"><SelectValue placeholder="Acción" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="POST">POST (crear)</SelectItem>
                <SelectItem value="PUT">PUT (editar)</SelectItem>
                <SelectItem value="PATCH">PATCH (modificar)</SelectItem>
                <SelectItem value="DELETE">DELETE (borrar)</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3B0E1A]/50" />
              <Input
                placeholder="Buscar por path, recurso, email..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            {(actor || method || q || range !== "7d") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setActor(""); setMethod(""); setQ(""); setRange("7d"); }}
                className="text-xs"
              >
                <Filter size={12} className="mr-1" /> Limpiar
              </Button>
            )}
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-[#3B0E1A]/60 text-sm">
              <History size={32} className="mx-auto mb-2 opacity-40" />
              No hay actividad para los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => {
                const link = resourceLink(e);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setDetail(e)}
                    className="block w-full text-left rounded-xl border border-[#3B0E1A]/15 bg-white/60 hover:bg-white p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-[11px] text-[#3B0E1A]/70">
                        <span className="font-mono">{format(new Date(e.created_at), "d MMM HH:mm", { locale: es })}</span>
                        <span>·</span>
                        <User size={11} />
                        <span className="font-medium text-[#1A060B]">{e.actor_email || "Sistema"}</span>
                        {e.actor_role && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3B0E1A]/10 text-[#3B0E1A] uppercase">
                            {e.actor_role}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(e.status_code)}`}>
                          {statusLabel(e.status_code)}
                        </Badge>
                      </div>
                    </div>
                    {(() => {
                      const human = humanizeAction(e.method, e.path, e.payload);
                      return (
                        <>
                          <p className="mt-1.5 text-sm font-medium text-[#1A060B]/85 truncate">{human.title}</p>
                          {human.detail && (
                            <p className="text-xs text-[#320C16] mt-0.5 truncate">{human.detail}</p>
                          )}
                        </>
                      );
                    })()}
                    {link && (
                      <span className="inline-flex items-center gap-1 mt-2 text-[11px] text-[#3B0E1A] font-medium">
                        <ExternalLink size={11} /> {link.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer de detalle */}
        <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalle de la acción</DialogTitle>
            </DialogHeader>
            {detail && (
              <div className="space-y-3 text-sm">
                {/* Resumen humano arriba */}
                {(() => {
                  const human = humanizeAction(detail.method, detail.path, detail.payload);
                  return (
                    <div className="rounded-xl border border-[#C9A5A8]/30 bg-[#C9A5A8]/10 p-3">
                      <p className="text-[15px] font-medium text-[#260910]">{human.title}</p>
                      {human.detail && <p className="text-xs text-[#320C16] mt-0.5">{human.detail}</p>}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[11px] text-[#3B0E1A]/70">Quién</p>
                    <p>{detail.actor_email || "Sistema"} <span className="text-[10px] text-[#3B0E1A]">({detail.actor_role || "—"})</span></p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#3B0E1A]/70">Cuándo</p>
                    <p>{format(new Date(detail.created_at), "d MMM yyyy · HH:mm:ss", { locale: es })}</p>
                    <p className="text-[11px] text-[#3B0E1A]/60">{formatDistanceToNow(new Date(detail.created_at), { addSuffix: true, locale: es })}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#3B0E1A]/70">Resultado</p>
                    <p><Badge variant="outline" className={statusBadgeClass(detail.status_code)}>{statusLabel(detail.status_code)}</Badge></p>
                  </div>
                  {detail.ip && (
                    <div>
                      <p className="text-[11px] text-[#3B0E1A]/70">IP</p>
                      <p className="font-mono text-xs">{detail.ip}</p>
                    </div>
                  )}
                </div>
                {/* Detalles técnicos colapsables */}
                <details className="rounded-lg border border-[#3B0E1A]/15 bg-white/40 p-2">
                  <summary className="cursor-pointer text-[11px] text-[#3B0E1A]/70 uppercase tracking-wide select-none">Detalles técnicos</summary>
                  <div className="mt-2 space-y-1.5 text-xs">
                    <p><span className="text-[#3B0E1A]/70">Método y ruta:</span> <span className="font-mono">{detail.method} {detail.path}</span></p>
                    <p className="break-all"><span className="text-[#3B0E1A]/70">URL completa:</span> <span className="font-mono">{detail.path_full || detail.path}</span></p>
                    <p><span className="text-[#3B0E1A]/70">Código HTTP:</span> <span className="font-mono">{detail.status_code}</span></p>
                  </div>
                </details>
                <div>
                  <p className="text-[11px] text-[#3B0E1A]/70 mb-1">Payload</p>
                  <pre className="bg-[#3B0E1A]/[0.04] border border-[#3B0E1A]/15 rounded-lg p-3 text-[11px] overflow-auto max-h-[300px]">
                    {JSON.stringify(detail.payload || {}, null, 2)}
                  </pre>
                </div>
                {resourceLink(detail) && (
                  <Button asChild size="sm" className="bg-[#3B0E1A] hover:bg-[#260910] text-white">
                    <Link to={resourceLink(detail)!.to}>{resourceLink(detail)!.label} →</Link>
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
}
