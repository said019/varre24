import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Pencil, Save, X, Minus, Plus, MoreHorizontal, Loader2, KeyRound, Copy, Lock,
  Mail, Phone, Cake, ShieldAlert, PartyPopper, UserCheck, UserX, Clock3,
  Calendar, CreditCard, Users as UsersIcon,
} from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const methodLabel: Record<string, string> = {
  cash: "Tarjeta",
  efectivo: "Tarjeta",
  transfer: "Transferencia",
  transferencia: "Transferencia",
  card: "Tarjeta",
  tarjeta: "Tarjeta",
};

// Cada movimiento del historial de créditos, en español claro para la dueña.
const creditReasonLabel: Record<string, string> = {
  booking_created: "Reservó clase",
  booking_created_with_guest: "Reservó + invitada",
  booking_cancelled_free: "Canceló (con reembolso)",
  booking_cancelled_free_with_guest: "Canceló con invitada (reembolso)",
  booking_cancelled_penalty: "Canceló (sin reembolso)",
  guest_removed_refund: "Quitó invitada (reembolso)",
  guest_removed_penalty: "Quitó invitada (sin reembolso)",
  admin_courtesy_granted: "Cortesía otorgada",
  owner_correction: "Corrección de la dueña",
  bulk_reconcile_trigger_fix: "Reajuste del sistema",
  reconcile_from_bookings: "Reconciliación por reservas",
  admin_manual_adjust: "Ajuste manual",
  admin_guest_added: "Invitada agregada (admin)",
  admin_guest_removed: "Invitada quitada (admin)",
  admin_booking_assigned: "Asignada por admin",
  admin_booking_assigned_with_guest: "Asignada por admin + invitada",
  admin_booking_cancelled: "Cancelada por admin (reembolso)",
  admin_no_show_refund: "Inasistencia (reembolso)",
  waitlist_promoted: "Promovida de lista de espera",
  waitlist_promoted_manual: "Promovida de lista de espera (admin)",
  class_cancelled_by_studio: "Clase cancelada por el estudio",
};

// ── Chips de estado — un solo lenguaje visual para membresías, reservas y pagos ──
type Tone = "success" | "danger" | "muted" | "warning" | "info";
const TONE_CLASS: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  danger: "bg-[#9B5B53]/10 text-[#9B5B53] border-[#9B5B53]/25",
  muted: "bg-[#3B0E1A]/[0.05] text-[#1A060B]/45 border-[#3B0E1A]/12",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  info: "bg-[#FFE4EE] text-[#8A5A5E] border-[#F5C2D6]",
};
const StatusPill = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.06em]", TONE_CLASS[tone])}>
    {children}
  </span>
);

const MEMBERSHIP_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Activa", tone: "success" },
  expired: { label: "Expirada", tone: "muted" },
  cancelled: { label: "Cancelada", tone: "danger" },
  paused: { label: "Pausada", tone: "warning" },
  pending_activation: { label: "Por activar", tone: "warning" },
  pending_payment: { label: "Pendiente de pago", tone: "warning" },
};

const BOOKING_STATUS: Record<string, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmada", tone: "info" },
  checked_in: { label: "Asistió", tone: "success" },
  cancelled: { label: "Cancelada", tone: "danger" },
  no_show: { label: "No asistió", tone: "warning" },
  waitlist: { label: "Lista de espera", tone: "muted" },
};

function paymentStatusMeta(status: string): { label: string; tone: Tone } {
  const s = String(status ?? "");
  if (s === "approved" || s === "active" || s === "paid" || s === "expired") return { label: "Pagado", tone: "success" };
  if (s === "pending_payment") return { label: "Esperando pago", tone: "warning" };
  if (s === "pending_verification") return { label: "Por verificar", tone: "warning" };
  if (s === "rejected") return { label: "Rechazado", tone: "danger" };
  if (s === "cancelled") return { label: "Cancelado", tone: "muted" };
  return { label: s, tone: "muted" };
}

const SOURCE_LABEL: Record<string, string> = {
  order: "En línea",
  walkin: "Walk-in",
  membership: "Venta de mostrador",
};

// Las fechas de nacimiento son fechas civiles (sin hora). Construirlas como
// fecha local evita que el navegador reste un día al interpretar YYYY-MM-DD en UTC.
function formatDateOnly(value?: string | null): string | null {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ── Bloque reutilizable del perfil: icono + etiqueta + valor ──
const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#3B0E1A]/[0.06] text-[#3B0E1A]">
      <Icon size={14} strokeWidth={1.75} />
    </span>
    <div className="min-w-0">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#9C8A8B]">{label}</p>
      <p className="mt-0.5 text-sm text-[#1A060B] break-words">{value || "—"}</p>
    </div>
  </div>
);

const SectionCard = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-5", className)}>{children}</div>
);

const MembershipsTab = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingMem, setEditingMem] = useState<any>(null);
  const [credits, setCredits] = useState(0);

  const { data: memberships } = useQuery({
    queryKey: ["client-memberships", userId],
    queryFn: async () => (await api.get(`/memberships?userId=${userId}`)).data,
    enabled: !!userId,
  });

  const updateMem = useMutation({
    mutationFn: ({ memId, classesRemaining }: { memId: string; classesRemaining: number }) =>
      api.put(`/memberships/${memId}`, { classesRemaining }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-memberships", userId] });
      toast({ title: "Créditos actualizados" });
      setEditingMem(null);
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const cancelMem = useMutation({
    mutationFn: (memId: string) => api.put(`/memberships/${memId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-memberships", userId] });
      toast({ title: "Membresía cancelada" });
    },
  });

  const reactivateMem = useMutation({
    mutationFn: (memId: string) => api.put(`/memberships/${memId}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-memberships", userId] });
      toast({ title: "Membresía reactivada" });
    },
    onError: () => toast({ title: "Error al reactivar", variant: "destructive" }),
  });

  const openEdit = (m: any) => {
    setCredits(m.classesRemaining ?? 0);
    setEditingMem(m);
  };

  const mems = (Array.isArray(memberships?.data) ? memberships.data : []).filter((m: any) => m.status !== "cancelled");

  return (
    <>
      {mems.length === 0 ? (
        <SectionCard className="py-10 text-center">
          <p className="text-sm text-[#1A060B]/45">Sin membresías activas</p>
        </SectionCard>
      ) : (
        <div className="space-y-2.5">
          {mems.map((m: any) => {
            const meta = MEMBERSHIP_STATUS[m.status] ?? { label: m.status, tone: "muted" as Tone };
            return (
              <SectionCard key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-[#1A060B]">{m.planName ?? m.planId}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    <span className="text-xs text-[#1A060B]/45">
                      {m.classesRemaining == null
                        ? "Clases ilimitadas"
                        : m.classLimit != null
                          ? `${m.classesRemaining} de ${m.classLimit} clases`
                          : `${m.classesRemaining} clases`}
                    </span>
                    {m.endDate && (
                      <span className="text-xs text-[#1A060B]/45">· Vence {new Date(m.endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => openEdit(m)}>Ajustar créditos</DropdownMenuItem>
                    {m.status === "cancelled" && (
                      <DropdownMenuItem
                        className="text-emerald-600"
                        onClick={() => { if (window.confirm("¿Reactivar esta membresía?")) reactivateMem.mutate(m.id); }}
                      >
                        Reactivar membresía
                      </DropdownMenuItem>
                    )}
                    {m.status === "active" && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => { if (window.confirm("¿Cancelar esta membresía? Esta acción es difícil de revertir.")) cancelMem.mutate(m.id); }}
                      >
                        Cancelar membresía
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </SectionCard>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingMem} onOpenChange={(v) => !v && setEditingMem(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Corregir créditos</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium">{editingMem?.planName}</p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠️ Solo usar para corregir errores. Para registrar asistencia usa la vista de clase → Asignar reserva → Check-in.
          </div>
          <div className="text-center text-xs text-muted-foreground">
            Clases disponibles (actualmente: <strong>{editingMem?.classesRemaining ?? "?"}</strong> de <strong>{editingMem?.classLimit ?? "?"}</strong>)
          </div>
          <div className="flex items-center justify-center gap-4 py-2">
            <Button variant="outline" size="icon" onClick={() => setCredits((c) => Math.max(0, c - 1))}>
              <Minus size={16} />
            </Button>
            <Input
              type="number"
              className="w-20 text-center text-lg font-bold"
              value={credits}
              onChange={(e) => setCredits(Math.max(0, parseInt(e.target.value) || 0))}
            />
            <Button variant="outline" size="icon" onClick={() => setCredits((c) => c + 1)}>
              <Plus size={16} />
            </Button>
          </div>
          {credits !== (editingMem?.classesRemaining ?? 0) && (
            <p className="text-center text-xs text-muted-foreground">
              Cambio: {editingMem?.classesRemaining ?? "?"} → <strong className={credits < (editingMem?.classesRemaining ?? 0) ? "text-destructive" : "text-emerald-600"}>{credits}</strong>
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMem(null)}>Cancelar</Button>
            <Button
              onClick={() => editingMem && updateMem.mutate({ memId: editingMem.id, classesRemaining: credits })}
              disabled={updateMem.isPending}
            >
              {updateMem.isPending ? <Loader2 className="animate-spin mr-1" size={14} /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: user, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
    enabled: !!id,
  });

  const { data: bookings } = useQuery({
    queryKey: ["client-bookings", id],
    queryFn: async () => (await api.get(`/bookings?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: memberships } = useQuery({
    queryKey: ["client-memberships", id],
    queryFn: async () => (await api.get(`/memberships?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ["client-payments", id],
    queryFn: async () => (await api.get(`/payments?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: credits } = useQuery({
    queryKey: ["client-credits", id],
    queryFn: async () => (await api.get(`/admin/users/${id}/credit-history`)).data,
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, string>) => api.put(`/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", id] });
      toast({ title: "Perfil actualizado" });
      setEditing(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al guardar", variant: "destructive" }),
  });

  const u = user?.data ?? user;
  const activeMembership = (Array.isArray(memberships?.data) ? memberships.data : []).find((m: any) => m.status === "active");

  const { data: walkinMatches } = useQuery({
    queryKey: ["walkin-matches", u?.phone],
    queryFn: async () => (await api.get(`/admin/walkins/by-phone?phone=${encodeURIComponent(u?.phone ?? "")}`)).data,
    enabled: !!u?.phone,
  });
  const walkinList: any[] = Array.isArray(walkinMatches?.data) ? walkinMatches.data : [];

  const linkWalkinsMutation = useMutation({
    mutationFn: () => api.post("/admin/walkins/link", { userId: id, phone: u?.phone }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["walkin-matches", u?.phone] });
      qc.invalidateQueries({ queryKey: ["client-payments", id] });
      qc.invalidateQueries({ queryKey: ["client-bookings", id] });
      toast({ title: res?.data?.message ?? "Compras vinculadas" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al vincular", variant: "destructive" }),
  });

  // Restablecer contraseña de la alumna (admin). Muestra la temporal para
  // entregársela. Resuelve "no puedo entrar / olvidé mi contraseña".
  const [resetResult, setResetResult] = useState<{ tempPassword: string; name: string; email: string } | null>(null);
  const resetPasswordMutation = useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/reset-password`, {}),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      if (d?.tempPassword) setResetResult(d);
      toast({ title: "Contraseña restablecida" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo restablecer", variant: "destructive" }),
  });

  const startEditing = () => {
    setForm({
      displayName: u?.displayName ?? "",
      phone: u?.phone ?? "",
      dateOfBirth: u?.dateOfBirth ?? "",
      emergencyContactName: u?.emergencyContactName ?? "",
      emergencyContactPhone: u?.emergencyContactPhone ?? "",
      healthNotes: u?.healthNotes ?? "",
      adminNotes: u?.adminNotes ?? "",
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const bookingsArr = Array.isArray(bookings?.data) ? bookings.data : [];
  const paymentsArr = Array.isArray(payments?.data) ? payments.data : [];
  const creditsArr = Array.isArray(credits?.data) ? credits.data : [];

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          {/* ── Encabezado ── */}
          {isLoading ? (
            <Skeleton className="h-24 w-full mb-6 rounded-2xl" />
          ) : (
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-5">
              <div className="flex items-center gap-4 min-w-0">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#3B0E1A] text-xl font-semibold text-[#FFD6E6]">
                  {(u?.displayName || "?")[0]?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-[#1A060B] truncate">{u?.displayName}</h1>
                  <p className="text-sm text-[#1A060B]/50 truncate">{u?.email} · {u?.phone}</p>
                  {activeMembership && (
                    <div className="mt-1.5">
                      <StatusPill tone="success">{activeMembership.planName}</StatusPill>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-[#3B0E1A]/20 text-[#3B0E1A] hover:bg-[#3B0E1A]/5"
                onClick={() => {
                  if (window.confirm(`¿Restablecer la contraseña de ${u?.displayName}? Se generará una contraseña temporal para entregársela.`)) {
                    resetPasswordMutation.mutate();
                  }
                }}
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : <KeyRound size={14} className="mr-1" />}
                Restablecer contraseña
              </Button>
            </div>
          )}

          {walkinList.length > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div>
                <p className="text-sm font-medium text-amber-900">
                  {walkinList.length} compra(s) previa(s) como invitada con este teléfono
                </p>
                <p className="text-xs text-amber-800">
                  Total: ${walkinList.reduce((s, w) => s + parseFloat(w.totalAmount ?? w.total_amount ?? 0), 0).toFixed(2)}
                </p>
              </div>
              <Button size="sm" className="bg-[#3B0E1A] hover:bg-[#320C16]" onClick={() => linkWalkinsMutation.mutate()} disabled={linkWalkinsMutation.isPending}>
                {linkWalkinsMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Vincular a esta cuenta
              </Button>
            </div>
          )}

          <Tabs defaultValue="profile">
            <TabsList className="h-auto rounded-full bg-[#3B0E1A]/[0.05] p-1 gap-1">
              {[
                ["profile", "Perfil"],
                ["memberships", "Membresías"],
                ["bookings", "Reservas"],
                ["payments", "Pagos"],
                ["creditos", "Créditos"],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[#1A060B]/50 data-[state=active]:bg-[#3B0E1A] data-[state=active]:text-[#FFD6E6] data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Perfil ── */}
            <TabsContent value="profile" className="mt-5">
              {isLoading ? <Skeleton className="h-40 w-full rounded-2xl" /> : editing ? (
                <SectionCard className="max-w-lg space-y-4">
                  <div className="space-y-1">
                    <Label>Nombre</Label>
                    <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Teléfono</Label>
                    <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fecha de nacimiento</Label>
                    <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Contacto de emergencia</Label>
                      <Input placeholder="Nombre" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Tel. emergencia</Label>
                      <Input placeholder="Teléfono" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Notas de salud</Label>
                    <Textarea rows={3} value={form.healthNotes} onChange={(e) => setForm({ ...form, healthNotes: e.target.value })} />
                    <p className="text-xs text-muted-foreground">La clienta puede ver y editar esta nota desde su perfil.</p>
                  </div>
                  <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <Label className="flex items-center gap-1.5"><Lock size={12} /> Notas internas (solo staff)</Label>
                    <Textarea
                      rows={3}
                      placeholder="Deudas, incidentes, acuerdos… la clienta nunca ve esto."
                      value={form.adminNotes}
                      onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
                    />
                    <p className="text-xs text-amber-800">Solo visible para el equipo del estudio.</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="bg-[#3B0E1A] hover:bg-[#320C16]" onClick={handleSave} disabled={updateMutation.isPending}>
                      <Save size={14} className="mr-1" /> Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                      <X size={14} className="mr-1" /> Cancelar
                    </Button>
                  </div>
                </SectionCard>
              ) : (
                <div className="space-y-4">
                  <SectionCard className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <InfoRow icon={Mail} label="Email" value={u?.email} />
                    <InfoRow icon={Phone} label="Teléfono" value={u?.phone} />
                    <InfoRow icon={Cake} label="Fecha de nacimiento" value={formatDateOnly(u?.dateOfBirth)} />
                    <InfoRow icon={ShieldAlert} label="Contacto de emergencia" value={u?.emergencyContactName ? `${u.emergencyContactName}${u?.emergencyContactPhone ? ` · ${u.emergencyContactPhone}` : ""}` : null} />
                    <div className="sm:col-span-2">
                      <InfoRow icon={ShieldAlert} label="Notas de salud" value={u?.healthNotes} />
                    </div>
                  </SectionCard>
                  <SectionCard className="border-amber-200 bg-amber-50/60">
                    <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-amber-800"><Lock size={12} /> Notas internas (solo staff)</p>
                    <p className="mt-1.5 text-sm text-amber-900 whitespace-pre-wrap">{u?.adminNotes || "Sin notas"}</p>
                  </SectionCard>
                  <Button size="sm" variant="outline" className="border-[#3B0E1A]/20 text-[#3B0E1A] hover:bg-[#3B0E1A]/5" onClick={startEditing}>
                    <Pencil size={14} className="mr-1" /> Editar perfil
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Membresías ── */}
            <TabsContent value="memberships" className="mt-5">
              <MembershipsTab userId={id!} />
            </TabsContent>

            {/* ── Reservas ── */}
            <TabsContent value="bookings" className="mt-5">
              {bookingsArr.length === 0 ? (
                <SectionCard className="py-10 text-center">
                  <p className="text-sm text-[#1A060B]/45">Sin reservas registradas</p>
                </SectionCard>
              ) : (
                <div className="space-y-2.5">
                  {bookingsArr.map((b: any) => {
                    const meta = BOOKING_STATUS[b.status] ?? { label: b.status, tone: "muted" as Tone };
                    const startTime = b.startTime ?? b.start_time;
                    const guestName = b.guestName ?? b.guest_name;
                    const instructorName = b.instructorName ?? b.instructor_name;
                    const cancelledAt = b.cancelledAt ?? b.cancelled_at;
                    const cancelledBy = b.cancelledBy ?? b.cancelled_by;
                    const cancellationReason = b.cancellationReason ?? b.cancellation_reason;
                    const checkedInAt = b.checkedInAt ?? b.checked_in_at;
                    const checkinMethod = b.checkinMethod ?? b.checkin_method;
                    return (
                      <SectionCard key={b.id} className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-[#1A060B]">{b.className ?? b.class_name ?? b.classId}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#1A060B]/50">
                              <Calendar size={12} className="shrink-0" />
                              {startTime ? new Date(startTime).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                              {instructorName && <span>· {instructorName}</span>}
                            </div>
                            {guestName && (
                              <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#8A5A5E]">
                                <UsersIcon size={12} /> +1 invitada: {guestName}
                              </p>
                            )}
                          </div>
                          <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                        </div>
                        {b.status === "cancelled" && (
                          <p className="mt-2.5 flex items-start gap-1.5 border-t border-[#E8D7D6] pt-2.5 text-xs text-[#1A060B]/50">
                            <UserX size={12} className="mt-0.5 shrink-0" />
                            Cancelada por {cancelledBy === "admin" ? "el estudio" : cancelledBy === "user" ? "la alumna" : "el sistema"}
                            {cancelledAt && ` · ${new Date(cancelledAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                            {cancellationReason && ` · ${cancellationReason}`}
                          </p>
                        )}
                        {b.status === "checked_in" && checkedInAt && (
                          <p className="mt-2.5 flex items-center gap-1.5 border-t border-[#E8D7D6] pt-2.5 text-xs text-[#1A060B]/50">
                            <UserCheck size={12} className="shrink-0" />
                            Check-in {checkinMethod === "auto" ? "automático" : "manual"} · {new Date(checkedInAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                        {b.status === "no_show" && (
                          <p className="mt-2.5 flex items-center gap-1.5 border-t border-[#E8D7D6] pt-2.5 text-xs text-[#1A060B]/50">
                            <Clock3 size={12} className="shrink-0" /> No se presentó a la clase
                          </p>
                        )}
                      </SectionCard>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Pagos ── */}
            <TabsContent value="payments" className="mt-5">
              {paymentsArr.length === 0 ? (
                <SectionCard className="py-10 text-center">
                  <p className="text-sm text-[#1A060B]/45">Sin pagos registrados</p>
                </SectionCard>
              ) : (
                <div className="space-y-2.5">
                  {paymentsArr.map((p: any) => {
                    const date = p.createdAt || p.created_at;
                    const method = p.method || p.payment_method || "";
                    const meta = paymentStatusMeta(p.status);
                    const isEvent = p.isEvent ?? p.is_event;
                    const orderNumber = p.orderNumber ?? p.order_number;
                    const reference = p.reference;
                    const source = p.source ? (SOURCE_LABEL[p.source] ?? p.source) : null;
                    return (
                      <SectionCard key={p.id} className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-medium text-sm text-[#1A060B]">
                              {isEvent && <PartyPopper size={13} className="shrink-0 text-[#8A5A5E]" />}
                              {p.planName ?? p.plan_name ?? "—"}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#1A060B]/50">
                              <CreditCard size={12} className="shrink-0" />
                              {(methodLabel[method.toLowerCase()] ?? method) || "—"}
                              {source && <span>· {source}</span>}
                              {date && <span>· {new Date(date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                            </div>
                            {(orderNumber || reference) && (
                              <p className="mt-1 text-xs text-[#1A060B]/40">
                                {orderNumber && `Orden ${orderNumber}`}
                                {orderNumber && reference && " · "}
                                {reference && `Ref. ${reference}`}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-base font-semibold text-[#1A060B]">${parseFloat(p.total_amount ?? p.totalAmount ?? p.amount ?? 0).toFixed(2)}</span>
                            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                          </div>
                        </div>
                      </SectionCard>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="creditos" className="mt-5">
              <p className="text-xs text-[#1A060B]/45 mb-3">
                Cada movimiento de créditos. Una reserva normal resta 1; reservar con
                invitada cuesta 2 (1 de ella + 1 de la invitada). La columna "Saldo" es
                lo que quedó después.
              </p>
              {(() => {
                const guestEvents = creditsArr.filter((m: any) => {
                  const r = String(m.reason ?? "");
                  return ["booking_created_with_guest", "admin_guest_added", "admin_booking_assigned_with_guest"].includes(r);
                }).length;
                return guestEvents > 0 ? (
                  <p className="text-xs mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#FFE4EE] text-[#8A5A5E] px-3 py-1 font-medium">
                    👤 Invitadas que ha llevado: <strong>{guestEvents}</strong> · {guestEvents} crédito(s) extra
                  </p>
                ) : null;
              })()}
              {creditsArr.length === 0 ? (
                <SectionCard className="py-10 text-center">
                  <p className="text-sm text-[#1A060B]/45">Sin movimientos de crédito</p>
                </SectionCard>
              ) : (
                <SectionCard className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Movimiento</TableHead><TableHead>Invitada / Clase</TableHead><TableHead className="text-right">Cambio</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {creditsArr.map((m: any) => {
                        const delta = Number(m.delta ?? 0);
                        const reason = String(m.reason ?? "");
                        const label = creditReasonLabel[reason] ?? reason;
                        const guest = m.guestName ?? m.guest_name ?? "";
                        const classDate = m.classDate ?? m.class_date;
                        // Solo las filas cuyo MOTIVO implica invitada muestran su nombre.
                        // (La reserva guarda el guest_name actual; si la invitada se agregó
                        // después, la fila original "Reservó clase" NO debe atribuírsela.)
                        const isGuest = reason.includes("guest") || reason.includes("invitada");
                        const showGuest = isGuest && !!guest;
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap">{m.createdAt ? new Date(m.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}</TableCell>
                            <TableCell>
                              {isGuest ? <StatusPill tone="info">{label}</StatusPill> : <span>{label}</span>}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {showGuest ? <span className="font-medium text-foreground">👤 {guest}</span> : null}
                              {showGuest && classDate ? " · " : null}
                              {classDate ? new Date(classDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : (!showGuest ? "—" : null)}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-[#9a4b3b]" : "text-muted-foreground"}`}>
                              {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—"}
                            </TableCell>
                            <TableCell className="text-right">{m.newValue ?? m.new_value ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </SectionCard>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Contraseña temporal tras restablecer */}
        <Dialog open={!!resetResult} onOpenChange={(o) => { if (!o) setResetResult(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><KeyRound size={16} /> Contraseña restablecida</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Comparte esta contraseña temporal con <strong className="text-foreground">{resetResult?.name}</strong> ({resetResult?.email}).
                Podrá entrar con ella y cambiarla después desde su perfil.
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-[#F3EFE9]/60 px-3 py-2.5">
                <code className="text-lg font-bold tracking-wide text-[#1A060B]">{resetResult?.tempPassword}</code>
                <Button
                  variant="ghost" size="icon"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(resetResult?.tempPassword ?? ""); toast({ title: "Copiada" }); }
                    catch { toast({ title: "No se pudo copiar", variant: "destructive" }); }
                  }}
                >
                  <Copy size={15} />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setResetResult(null)}>Entendido</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientDetail;
