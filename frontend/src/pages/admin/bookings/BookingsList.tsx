import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { CourtesyButton } from "@/components/admin/CourtesyButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2,
  Clock, ArrowLeft, UserCheck, UserX, Calendar, Plus, Search, Ban, UserPlus, UserMinus,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RosterEntry {
  bookingId: string;
  status: string;
  checkedInAt: string | null;
  checkinMethod: string | null;
  noShowAt: string | null;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  planName: string | null;
  classesRemaining: number | null;
  guestName?: string | null;
}

interface ClientOption {
  id: string;
  displayName: string;
  email?: string;
  phone?: string | null;
}

// ── Status config ──────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed:  { label: "Confirmada",   className: "text-[#F5ECDB] border-[#F5ECDB]/30 bg-[#F5ECDB]/5" },
  checked_in: { label: "Asistió ✓",   className: "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/5" },
  waitlist:   { label: "Lista espera", className: "text-[#C8B79E] border-[#C8B79E]/30 bg-[#C8B79E]/5" },
  no_show:    { label: "No asistió",   className: "text-[#f87171] border-[#f87171]/30 bg-[#f87171]/5" },
  cancelled:  { label: "Cancelada",    className: "text-[#2d2d2d]/30 border-[#836A5D]/15 bg-[#836A5D]/[0.04]" },
};

// ── Class Roster panel ─────────────────────────────────────────────────────────
const ClassRoster = ({ classId, onBack }: { classId: string; onBack: () => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const debouncedMemberSearch = useDebounce(memberSearch, 250);
  const [assignBringGuest, setAssignBringGuest] = useState(false);
  const [assignGuestName, setAssignGuestName] = useState("");
  const [assignGuestPhone, setAssignGuestPhone] = useState("");

  // Edit / add / remove guest sobre una reserva existente.
  const [guestEditor, setGuestEditor] = useState<{ bookingId: string; userName: string; initialName: string } | null>(null);
  const [guestEditorName, setGuestEditorName] = useState("");
  const [guestEditorPhone, setGuestEditorPhone] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    refetchInterval: 15000,
  });

  const classInfo = data?.data?.class ?? null;
  const roster: RosterEntry[] = data?.data?.roster ?? [];
  const { data: usersData, isFetching: searchingUsers } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["booking-assign-users", classId, debouncedMemberSearch],
    enabled: assignOpen,
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedMemberSearch ? `&search=${encodeURIComponent(debouncedMemberSearch)}` : ""}`)
    ).data,
  });
  const userOptions = Array.isArray(usersData?.data) ? usersData.data : [];

  const checkinMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: "✅ Check-in registrado" });
    },
    onError: () => toast({ title: "Error al hacer check-in", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put(`/admin/bookings/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-roster", classId] });
      toast({ title: "Reserva cancelada y crédito devuelto" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al cancelar", variant: "destructive" }),
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: "Marcado como no asistió" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  // Revertir un check-in (auto o manual) a no_show, con opción de devolver crédito
  const [noShowModal, setNoShowModal] = useState<{ open: boolean; bookingId: string | null }>({ open: false, bookingId: null });
  const [refundCredit, setRefundCredit] = useState(false);
  const markNoShowMutation = useMutation({
    mutationFn: ({ id, refundCredit }: { id: string; refundCredit: boolean }) =>
      api.put(`/admin/bookings/${id}/mark-no-show`, { refundCredit }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({
        title: "Reserva marcada como no asistió",
        description: res?.data?.refunded ? "Crédito devuelto a la alumna." : "Sin devolución de crédito.",
      });
      setNoShowModal({ open: false, bookingId: null });
      setRefundCredit(false);
    },
    onError: () => toast({ title: "Error al marcar como no asistió", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post("/admin/bookings/assign", {
        classId,
        userId,
        ...(assignBringGuest && assignGuestName.trim() ? {
          guestName: assignGuestName.trim(),
          guestPhone: assignGuestPhone.trim() || undefined,
        } : {}),
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      const msg = res?.data?.message ?? "Reserva asignada";
      toast({ title: assignBringGuest ? `${msg} (con invitada)` : msg });
      setAssignOpen(false);
      setMemberSearch("");
      setAssignBringGuest(false);
      setAssignGuestName("");
      setAssignGuestPhone("");
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al asignar reserva", variant: "destructive" });
    },
  });

  // Agregar / editar invitada de una reserva existente (admin)
  const guestUpsertMutation = useMutation({
    mutationFn: ({ bookingId, guestName, guestPhone }: { bookingId: string; guestName: string; guestPhone?: string }) =>
      api.put(`/admin/bookings/${bookingId}/guest`, { guestName, guestPhone }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: res?.data?.message ?? "Invitada actualizada" });
      setGuestEditor(null);
      setGuestEditorName("");
      setGuestEditorPhone("");
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "No se pudo guardar la invitada", variant: "destructive" });
    },
  });

  // Quitar invitada (admin, sin restricciones de ventana)
  const guestRemoveMutation = useMutation({
    mutationFn: (bookingId: string) => api.delete(`/admin/bookings/${bookingId}/guest`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({
        title: "Invitada removida",
        description: res?.data?.refunded ? "Se devolvió 1 crédito." : "Sin devolución de crédito.",
      });
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "No se pudo quitar la invitada", variant: "destructive" });
    },
  });

  const checkedIn = roster.filter((r) => r.status === "checked_in").length;
  const confirmed = roster.filter((r) => r.status === "confirmed").length;
  const waitlist  = roster.filter((r) => r.status === "waitlist").length;
  const noShow    = roster.filter((r) => r.status === "no_show").length;

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#2d2d2d]/40 hover:text-[#2d2d2d]/70 transition-colors"
      >
        <ArrowLeft size={14} /> Volver al calendario
      </button>

      {/* Class header */}
      {isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : classInfo && (
        <div className="rounded-2xl border border-[#836A5D]/15 bg-[#836A5D]/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: classInfo.color || "#836A5D" }}
                />
                <h2 className="text-xl font-bold text-[#2d2d2d]">{classInfo.classTypeName}</h2>
              </div>
              <p className="text-sm text-[#2d2d2d]/50">
                {classInfo.startsAt
                  ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es })
                  : classInfo.date ?? "—"}
              </p>
              <p className="text-xs text-[#2d2d2d]/35 mt-0.5">Instructor: {classInfo.instructorName}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="text-xs text-[#C8B79E]/60 hover:text-[#C8B79E] transition-colors flex items-center gap-1"
            >
              <Clock size={11} /> Actualizar
            </button>
          </div>

          <div className="mt-3">
            <Button
              size="sm"
              onClick={() => setAssignOpen(true)}
              className="bg-gradient-to-r from-[#C8B79E] to-[#836A5D] text-white"
            >
              <Plus size={14} className="mr-1" /> Asignar miembro
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Confirmadas", value: confirmed, color: "#F5ECDB" },
              { label: "Asistieron",  value: checkedIn, color: "#4ade80" },
              { label: "Lista esp.",  value: waitlist,  color: "#C8B79E" },
              { label: "No asistió",  value: noShow,    color: "#f87171" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[#836A5D]/15 bg-[#836A5D]/[0.05] px-3 py-2 text-center">
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-[#2d2d2d]/35 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roster list */}
      <div className="space-y-2">
        {isLoading
          ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          : roster.length === 0
            ? (
              <div className="text-center py-12 text-[#2d2d2d]/25 text-sm">
                <Users size={28} className="mx-auto mb-2 opacity-30" />
                No hay reservas para esta clase
              </div>
            )
            : roster.map((entry) => {
              const sc = statusConfig[entry.status] ?? statusConfig.confirmed;
              const canCheckin = entry.status === "confirmed" || entry.status === "waitlist";
              const canNoShow  = entry.status === "confirmed";
              const canCancel  = entry.status === "confirmed" || entry.status === "waitlist";
              const canRevertToNoShow = entry.status === "checked_in";
              const methodBadge =
                entry.status === "checked_in"
                  ? entry.checkinMethod === "auto"
                    ? { label: "auto", cls: "bg-gray-100 text-gray-600 border-gray-300/40" }
                    : entry.checkinMethod === "qr_scan"
                    ? { label: "QR", cls: "bg-emerald-50 text-emerald-700 border-emerald-300/40" }
                    : entry.checkinMethod === "manual_reception"
                    ? { label: "Recep.", cls: "bg-blue-50 text-blue-700 border-blue-300/40" }
                    : null
                  : null;
              return (
                <div
                  key={entry.bookingId}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border transition-all",
                    entry.status === "checked_in"
                      ? "border-[#4ade80]/20 bg-[#4ade80]/5"
                      : entry.status === "no_show"
                        ? "border-[#f87171]/15 bg-[#f87171]/3 opacity-60"
                        : "border-[#836A5D]/15 bg-[#836A5D]/[0.04] hover:bg-[#836A5D]/[0.06]"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                    entry.status === "checked_in"
                      ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30"
                      : "bg-gradient-to-br from-[#836A5D]/20 to-[#C8B79E]/10 border border-[#836A5D]/20 text-[#836A5D]"
                  )}>
                    {entry.status === "checked_in"
                      ? <UserCheck size={16} />
                      : ((entry.userId ? entry.displayName : entry.guestName)?.[0]?.toUpperCase() ?? "?")}
                  </div>

                  {/* Info — walk-in (sin cuenta): su nombre va en guestName. */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#2d2d2d]/90 truncate flex items-center gap-1.5">
                      {entry.userId ? entry.displayName : (entry.guestName ?? "Invitado")}
                      {!entry.userId && (
                        <span className="text-[9px] font-semibold px-1.5 py-0 rounded-full border border-amber-400/60 text-amber-600">Walk-in</span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs text-[#2d2d2d]/35 truncate">{entry.userId ? entry.email : "Sin cuenta"}</span>
                      {entry.phone && <span className="text-xs text-[#2d2d2d]/25">{entry.phone}</span>}
                    </div>
                    {entry.userId && entry.planName && (
                      <p className="text-[10px] text-[#C8B79E]/60 mt-0.5">
                        {entry.planName}
                        {entry.classesRemaining !== null
                          ? ` · ${entry.classesRemaining} clases restantes`
                          : " · Ilimitado"}
                      </p>
                    )}
                    {entry.userId && entry.guestName && (
                      <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-[#C8B79E]/25 border border-[#836A5D]/20 px-2 py-0.5 text-[10px] font-semibold text-[#6C5147]">
                        +1 invitada · {entry.guestName} · cuenta como 2
                      </span>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0", sc.className)}>
                    {sc.label}
                  </span>
                  {methodBadge && (
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0", methodBadge.cls)}>
                      {methodBadge.label}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Invitada: agregar / quitar (solo si la reserva sigue activa) */}
                    {(entry.status === "confirmed" || entry.status === "checked_in" || entry.status === "waitlist") && (
                      entry.guestName ? (
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Quitar a ${entry.guestName} de esta reserva? Se libera 1 lugar y se devuelve 1 crédito (si aplica).`)) {
                              guestRemoveMutation.mutate(entry.bookingId);
                            }
                          }}
                          disabled={guestRemoveMutation.isPending}
                          title="Quitar invitada"
                          className="w-8 h-8 rounded-lg bg-[#C8B79E]/15 border border-[#836A5D]/25 text-[#6C5147] hover:bg-[#C8B79E]/25 flex items-center justify-center transition-all disabled:opacity-40"
                        >
                          <UserMinus size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setGuestEditor({ bookingId: entry.bookingId, userName: entry.displayName, initialName: "" });
                            setGuestEditorName("");
                            setGuestEditorPhone("");
                          }}
                          title="Agregar invitada"
                          className="w-8 h-8 rounded-lg bg-[#836A5D]/8 border border-[#836A5D]/20 text-[#836A5D]/80 hover:bg-[#836A5D]/15 flex items-center justify-center transition-all"
                        >
                          <UserPlus size={14} />
                        </button>
                      )
                    )}
                    {canCheckin && (
                      <button
                        onClick={() => checkinMutation.mutate(entry.bookingId)}
                        disabled={checkinMutation.isPending}
                        title="Check-in"
                        className="w-8 h-8 rounded-lg bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80] hover:bg-[#4ade80]/20 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    {canNoShow && (
                      <button
                        onClick={() => noShowMutation.mutate(entry.bookingId)}
                        disabled={noShowMutation.isPending}
                        title="No asistió"
                        className="w-8 h-8 rounded-lg bg-[#f87171]/8 border border-[#f87171]/20 text-[#f87171]/70 hover:bg-[#f87171]/15 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <UserX size={14} />
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => { if (window.confirm("¿Cancelar esta reserva y devolver crédito?")) cancelMutation.mutate(entry.bookingId); }}
                        disabled={cancelMutation.isPending}
                        title="Cancelar reserva"
                        className="w-8 h-8 rounded-lg bg-[#836A5D]/8 border border-[#836A5D]/20 text-[#836A5D]/70 hover:bg-[#836A5D]/15 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    {canRevertToNoShow && (
                      <button
                        onClick={() => { setRefundCredit(false); setNoShowModal({ open: true, bookingId: entry.bookingId }); }}
                        disabled={markNoShowMutation.isPending}
                        title="Marcar como no asistió"
                        className="w-8 h-8 rounded-lg bg-[#f87171]/8 border border-[#f87171]/20 text-[#f87171]/70 hover:bg-[#f87171]/15 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <UserX size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
        }
      </div>

      <Dialog
        open={assignOpen}
        onOpenChange={(next) => {
          setAssignOpen(next);
          if (!next) {
            setMemberSearch("");
            setAssignBringGuest(false);
            setAssignGuestName("");
            setAssignGuestPhone("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar reserva a miembro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Toggle invitada */}
            <div className="rounded-xl border border-[#836A5D]/20 bg-[#836A5D]/[0.04] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm font-semibold text-[#2d2d2d] flex items-center gap-1.5">
                    <UserPlus size={13} className="text-[#836A5D]" /> Llevar invitada
                  </Label>
                  <p className="text-[11px] text-[#715B50] leading-snug mt-0.5">
                    Se cobran 2 créditos y se ocupan 2 lugares. No aplica en Clase de prueba.
                  </p>
                </div>
                <Switch
                  checked={assignBringGuest}
                  onCheckedChange={(v) => {
                    setAssignBringGuest(v);
                    if (!v) { setAssignGuestName(""); setAssignGuestPhone(""); }
                  }}
                />
              </div>
              {assignBringGuest && (
                <div className="mt-3 space-y-2">
                  <Input
                    placeholder="Nombre de la invitada"
                    value={assignGuestName}
                    onChange={(e) => setAssignGuestName(e.target.value)}
                    maxLength={120}
                  />
                  <Input
                    placeholder="Teléfono (opcional)"
                    value={assignGuestPhone}
                    onChange={(e) => setAssignGuestPhone(e.target.value)}
                    maxLength={40}
                    type="tel"
                  />
                </div>
              )}
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2d2d2d]/35" />
              <Input
                className="pl-8"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono"
              />
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              {searchingUsers ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
              ) : userOptions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
              ) : (
                userOptions.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={assignMutation.isPending || (assignBringGuest && !assignGuestName.trim())}
                    onClick={() => assignMutation.mutate(u.id)}
                    title={assignBringGuest && !assignGuestName.trim() ? "Captura el nombre de la invitada primero" : undefined}
                    className="w-full px-3 py-2.5 text-left hover:bg-[#836A5D]/[0.06] border-b last:border-b-0 border-border disabled:opacity-60"
                  >
                    <p className="text-sm font-medium">
                      {u.displayName}
                      {assignBringGuest && assignGuestName.trim() ? ` + ${assignGuestName.trim()}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {u.email ?? "—"}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Marcar como no asistió — modal con checkbox de refund */}
      <Dialog open={noShowModal.open} onOpenChange={(open) => { if (!open) { setNoShowModal({ open: false, bookingId: null }); setRefundCredit(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como no asistió</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-[#5F4B3D]/80">
              La reserva pasará a <strong>no_show</strong>. El cupo ya está libre (la alumna no asistió a la clase).
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={refundCredit}
                onChange={(e) => setRefundCredit(e.target.checked)}
              />
              <span className="text-sm">
                <strong>Devolver el crédito</strong> a la alumna
                <span className="block text-xs text-[#5F4B3D]/55">
                  Úsalo solo si hay una razón humana (emergencia, error). Por defecto NO se devuelve.
                </span>
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setNoShowModal({ open: false, bookingId: null })}>Cancelar</Button>
            <Button
              onClick={() => noShowModal.bookingId && markNoShowMutation.mutate({ id: noShowModal.bookingId, refundCredit })}
              disabled={markNoShowMutation.isPending}
            >
              {markNoShowMutation.isPending ? "Procesando…" : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: agregar invitada a una reserva existente */}
      <Dialog
        open={!!guestEditor}
        onOpenChange={(o) => { if (!o) { setGuestEditor(null); setGuestEditorName(""); setGuestEditorPhone(""); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar invitada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {guestEditor && (
              <p className="text-xs text-muted-foreground">
                Reserva de <strong className="text-[#2d2d2d]">{guestEditor.userName}</strong>. Se descuenta 1 crédito y se ocupa 1 lugar adicional.
              </p>
            )}
            <Input
              placeholder="Nombre de la invitada"
              value={guestEditorName}
              onChange={(e) => setGuestEditorName(e.target.value)}
              maxLength={120}
              autoFocus
            />
            <Input
              placeholder="Teléfono (opcional)"
              value={guestEditorPhone}
              onChange={(e) => setGuestEditorPhone(e.target.value)}
              maxLength={40}
              type="tel"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestEditor(null)}>Cancelar</Button>
            <Button
              disabled={!guestEditorName.trim() || guestUpsertMutation.isPending}
              onClick={() => guestEditor && guestUpsertMutation.mutate({
                bookingId: guestEditor.bookingId,
                guestName: guestEditorName.trim(),
                guestPhone: guestEditorPhone.trim() || undefined,
              })}
            >
              {guestUpsertMutation.isPending ? "Guardando…" : "Agregar invitada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Weekly class picker ────────────────────────────────────────────────────────
const ClassPicker = ({ onSelectClass }: { onSelectClass: (id: string) => void }) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-classes-week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
  });
  const classes: any[] = Array.isArray(data?.data) ? data.data : [];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          className="w-8 h-8 rounded-lg border border-[#836A5D]/15 text-[#2d2d2d]/40 hover:text-[#2d2d2d]/70 hover:border-[#836A5D]/25 flex items-center justify-center transition-all"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-[#2d2d2d]/70 min-w-[200px] text-center">
          {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
        </span>
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          className="w-8 h-8 rounded-lg border border-[#836A5D]/15 text-[#2d2d2d]/40 hover:text-[#2d2d2d]/70 hover:border-[#836A5D]/25 flex items-center justify-center transition-all"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="ml-2 text-xs text-[#836A5D]/60 hover:text-[#836A5D] transition-colors"
        >
          Hoy
        </button>
      </div>

      {/* Days */}
      <div className="space-y-4">
        {days.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayClasses = classes
            .filter((c) => {
              // date field is always YYYY-MM-DD after server normalisation
              const d = (c.date as string)?.slice(0, 10)
                ?? (c.start_time as string)?.slice(0, 10);
              return d === dayStr;
            })
            .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

          if (!dayClasses.length && !isLoading) return null;

          const isToday = dayStr === todayStr;

          return (
            <div key={dayStr}>
              <div className="flex items-center gap-2 mb-2">
                <p className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  isToday ? "text-[#836A5D]" : "text-[#2d2d2d]/30"
                )}>
                  {format(day, "EEEE d", { locale: es })}
                </p>
                {isToday && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#836A5D]/15 text-[#836A5D] border border-[#836A5D]/25 font-semibold">
                    Hoy
                  </span>
                )}
              </div>

              {isLoading ? (
                <Skeleton className="h-16 rounded-xl" />
              ) : (
                <div className="space-y-2">
                  {dayClasses.map((cls) => {
                    const time = cls.start_time
                      ? format(new Date(cls.start_time), "HH:mm")
                      : cls.startTime ?? "—";
                    const capacity = cls.max_capacity ?? 0;
                    const booked   = cls.current_bookings ?? 0;
                    const full     = capacity > 0 && booked >= capacity;
                    const pct      = capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;

                    return (
                      <button
                        key={cls.id}
                        onClick={() => onSelectClass(cls.id)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#836A5D]/15 bg-[#836A5D]/[0.04] hover:border-[#836A5D]/30 hover:bg-[#836A5D]/5 transition-all group text-left"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cls.class_type_color ?? cls.color ?? "#836A5D" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#2d2d2d]/85 truncate">
                            {cls.class_type_name ?? cls.className ?? "Clase"}
                          </p>
                          <p className="text-xs text-[#2d2d2d]/35">{time} · {cls.instructor_name ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={cn("text-sm font-bold", full ? "text-[#f87171]" : "text-[#2d2d2d]/70")}>
                              {booked}/{capacity}
                            </p>
                            <p className="text-[10px] text-[#2d2d2d]/25">lugares</p>
                          </div>
                          <div className="w-12 h-1.5 rounded-full bg-[#836A5D]/10 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", full ? "bg-[#f87171]" : "bg-[#836A5D]")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <ChevronRight size={14} className="text-[#2d2d2d]/20 group-hover:text-[#836A5D]/60 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && classes.length === 0 && (
          <div className="text-center py-16 text-[#2d2d2d]/25 text-sm">
            <Calendar size={28} className="mx-auto mb-2 opacity-30" />
            No hay clases programadas esta semana
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
const BookingsList = () => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          <div className="mb-7 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-[#2d2d2d] mb-1">Reservas</h1>
              <p className="text-sm text-[#2d2d2d]/35">
                {selectedClassId
                  ? "Lista de alumnos · check-in y asistencia"
                  : "Selecciona una clase para ver su lista de alumnos"}
              </p>
            </div>
            <CourtesyButton />
          </div>

          {selectedClassId ? (
            <ClassRoster classId={selectedClassId} onBack={() => setSelectedClassId(null)} />
          ) : (
            <ClassPicker onSelectClass={setSelectedClassId} />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default BookingsList;
