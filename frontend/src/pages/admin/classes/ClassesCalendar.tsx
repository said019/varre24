import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfWeek, addDays, parseISO, eachDayOfInterval, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { CourtesyButton } from "@/components/admin/CourtesyButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, studioNow } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Palette, Zap, MoreHorizontal, Loader2, UserCheck, Sparkles, Calendar, Users, X, UserPlus, UserMinus, CheckCircle2, UserX, Copy } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { ClassCategoryBadge } from "@/components/ClassCategoryBadge";

/* ── Palette ── */
const PALETTE_COLORS = [
  { label: "Taupe", value: "#3B0E1A" },
  { label: "Sage", value: "#C9A5A8" },
  { label: "Crema", value: "#EADCDD" },
  { label: "Azul", value: "#3B82F6" },
  { label: "Esmeralda", value: "#10B981" },
  { label: "Naranja", value: "#F97316" },
  { label: "Rosa", value: "#EC4899" },
  { label: "Índigo", value: "#6366F1" },
];

/* ── Types ── */
interface ClassInstance {
  id: string;
  classTypeId: string;
  classTypeName?: string;
  classTypeColor?: string;
  instructorId: string;
  instructorName?: string;
  instructorPhoto?: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  capacity?: number;
  bookedCount?: number;
  currentBookings?: number;
  isCancelled: boolean;
  notes?: string;
}

interface ClassType {
  id: string;
  name: string;
  color: string;
  category?: "pilates" | "bienestar";
  defaultDuration?: number;
  durationMin?: number;
  maxCapacity?: number;
  capacity?: number;
  isActive?: boolean;
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const GENERATE_DAYS = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mié", value: 3 },
  { label: "Jue", value: 4 },
  { label: "Vie", value: 5 },
  { label: "Sáb", value: 6 },
  { label: "Dom", value: 0 },
];

const TABS = [
  { key: "calendar",     label: "Calendario",    icon: CalendarDays },
  { key: "types",        label: "Tipos de clase", icon: Palette },
  { key: "generate",     label: "Generar semana", icon: Zap },
  { key: "instructors",  label: "Instructoras",   icon: UserCheck },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/* ── Schemas ── */
const classSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  maxCapacity: z.coerce.number().min(1),
  notes: z.string().optional(),
});
type ClassFormData = z.infer<typeof classSchema>;

const typeSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#C9A5A8"),
  category: z.enum(["pilates", "bienestar"]).default("pilates"),
  defaultDuration: z.coerce.number().min(1),
  maxCapacity: z.coerce.number().min(1),
  isActive: z.boolean().default(true),
});
type TypeFormData = z.infer<typeof typeSchema>;

/* ── Instructor schemas ── */
const instructorSchema = z.object({
  displayName: z.string().trim().min(1, "Nombre requerido"),
  email: z.string().trim().email("Email inválido"),
  bio: z.string().optional(),
  specialties: z.string().optional(),
  isActive: z.boolean().default(true),
  photoFocusX: z.coerce.number().min(0).max(100).default(50),
  photoFocusY: z.coerce.number().min(0).max(100).default(50),
});
type InstructorFormData = z.infer<typeof instructorSchema>;
interface Instructor extends Omit<InstructorFormData, "specialties"> {
  id: string;
  specialties?: string[] | string | null;
  photoUrl?: string;
  photoFocusX?: number;
  photoFocusY?: number;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (_) {
      // fallback parsing below
    }
    return value
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((item) => item.replace(/^"+|"+$/g, "").trim())
      .filter(Boolean);
  }
  return [];
}

function instructorPayload(d: InstructorFormData) {
  return {
    displayName: d.displayName.trim(),
    email: d.email.trim().toLowerCase(),
    bio: d.bio?.trim() || null,
    specialties: normalizeSpecialties(d.specialties),
    isActive: d.isActive,
    photoFocusX: clampFocus(d.photoFocusX),
    photoFocusY: clampFocus(d.photoFocusY),
  };
}

function getFocusFromPointerEvent(event: React.PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const nextX = ((event.clientX - rect.left) / rect.width) * 100;
  const nextY = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    x: clampFocus(nextX),
    y: clampFocus(nextY),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in: "Asistió",
  waitlist: "Lista espera",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-[#3B0E1A]/15 text-[#3B0E1A]",
  checked_in: "bg-emerald-500/15 text-emerald-600",
  waitlist: "bg-amber-500/15 text-amber-600",
  no_show: "bg-red-500/15 text-red-600",
  cancelled: "bg-gray-500/15 text-gray-500",
};

const ClassAttendees = ({ classId }: { classId: string }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ name: "", phone: "", planId: "", paymentMethod: "cash", amount: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["class-roster-mini", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    enabled: !!classId,
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans-walkin"],
    queryFn: async () => (await api.get("/plans")).data,
    enabled: showWalkIn,
  });
  const walkInPlans: any[] = (Array.isArray(plansData?.data) ? plansData.data : [])
    .filter((p: any) => (p.isActive ?? p.is_active) !== false);

  const walkInMutation = useMutation({
    mutationFn: (body: any) => api.post(`/admin/classes/${classId}/walkin`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-roster-mini", classId] });
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: "Lugar bloqueado y pago registrado" });
      setWalkInForm({ name: "", phone: "", planId: "", paymentMethod: "cash", amount: "" });
      setShowWalkIn(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al bloquear", variant: "destructive" }),
  });

  const cancelWalkInMutation = useMutation({
    mutationFn: (bookingId: string) => api.delete(`/admin/bookings/${bookingId}/walkin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-roster-mini", classId] });
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      toast({ title: "Lugar liberado" });
    },
    onError: () => toast({ title: "Error al liberar lugar", variant: "destructive" }),
  });

  // ── Invitada en reserva de alumna existente ──
  const [guestEditor, setGuestEditor] = useState<{ bookingId: string; userName: string } | null>(null);
  const [guestEditorName, setGuestEditorName] = useState("");
  const [guestEditorPhone, setGuestEditorPhone] = useState("");

  const addGuestMutation = useMutation({
    mutationFn: ({ bookingId, guestName, guestPhone }: { bookingId: string; guestName: string; guestPhone?: string }) =>
      api.put(`/admin/bookings/${bookingId}/guest`, { guestName, guestPhone }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-roster-mini", classId] });
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      toast({ title: "Invitada agregada" });
      setGuestEditor(null);
      setGuestEditorName("");
      setGuestEditorPhone("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo agregar la invitada", variant: "destructive" }),
  });

  const removeGuestMutation = useMutation({
    mutationFn: (bookingId: string) => api.delete(`/admin/bookings/${bookingId}/guest`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["class-roster-mini", classId] });
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      toast({
        title: "Invitada removida",
        description: res?.data?.refunded ? "Se devolvió 1 crédito." : "Sin devolución de crédito.",
      });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al quitar invitada", variant: "destructive" }),
  });

  // Confirmar asistencia / no asistió (mismo endpoint que usa Reservas).
  // Funciona para alumna, alumna+invitada (1 check-in cubre a ambas) y walk-in.
  const checkinMutation = useMutation({
    mutationFn: (bookingId: string) => api.put(`/bookings/${bookingId}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-roster-mini", classId] });
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      toast({ title: "Asistencia confirmada" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al confirmar", variant: "destructive" }),
  });
  const noShowMutation = useMutation({
    mutationFn: (bookingId: string) => api.put(`/bookings/${bookingId}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-roster-mini", classId] });
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      toast({ title: "Marcada como no asistió" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error", variant: "destructive" }),
  });

  const roster: any[] = data?.data?.roster ?? data?.roster ?? [];

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users size={14} />
          Asistentes ({roster.length})
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowWalkIn(true)}>
          <Plus size={12} className="mr-1" />Bloquear lugar
        </Button>
      </div>

      <Dialog open={showWalkIn} onOpenChange={(v) => { if (!v) setShowWalkIn(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bloquear lugar — Walk-in</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={walkInForm.name} onChange={(e) => setWalkInForm({ ...walkInForm, name: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono (opcional)</Label>
              <PhoneInput
                value={walkInForm.phone}
                onChange={(v) => setWalkInForm({ ...walkInForm, phone: v })}
              />
              <p className="text-[10px] text-muted-foreground">Si después se registra, se vincularán sus compras automáticamente.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Plan</Label>
              <Select value={walkInForm.planId} onValueChange={(v) => {
                const plan = walkInPlans.find((p: any) => p.id === v);
                const price = plan?.discountPrice ?? plan?.discount_price ?? plan?.price ?? "";
                setWalkInForm({ ...walkInForm, planId: v, amount: price ? String(price) : walkInForm.amount });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona un plan" /></SelectTrigger>
                <SelectContent>
                  {walkInPlans.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — ${p.price}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Método de pago</Label>
                <Select value={walkInForm.paymentMethod} onValueChange={(v) => setWalkInForm({ ...walkInForm, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Monto cobrado</Label>
                <Input type="number" placeholder="0" value={walkInForm.amount}
                  onChange={(e) => setWalkInForm({ ...walkInForm, amount: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWalkIn(false)}>Cancelar</Button>
            <Button
              disabled={!walkInForm.name.trim() || walkInMutation.isPending}
              onClick={() => walkInMutation.mutate({
                name: walkInForm.name.trim(),
                phone: (walkInForm.phone || "").trim() || null,
                planId: walkInForm.planId || null,
                paymentMethod: walkInForm.paymentMethod,
                amount: walkInForm.amount ? Number(walkInForm.amount) : 0,
              })}
            >
              {walkInMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : roster.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin reservas</p>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-auto">
          {roster.map((r: any) => {
            const isWalkIn = !r.userId && !r.user_id;
            const memberName = r.displayName ?? r.display_name;
            const guestName = r.guestName ?? r.guest_name ?? null;
            // En walk-in, guest_name es la única columna con identidad.
            const name = memberName ?? guestName ?? "—";
            const memberHasGuest = !isWalkIn && !!guestName;
            const bookingId = r.bookingId ?? r.booking_id;
            const canEditGuest = !isWalkIn && (r.status === "confirmed" || r.status === "waitlist" || r.status === "checked_in");
            return (
              <div key={bookingId} className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{name}</p>
                    {isWalkIn && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-400/60 text-amber-600">Walk-in</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {isWalkIn ? "Walk-in / Sin cuenta" : (r.planName ?? r.plan_name ?? "")}
                  </p>
                  {memberHasGuest && (
                    <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-[#C9A5A8]/25 border border-[#3B0E1A]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#260910]">
                      +1 invitada · {guestName} · cuenta como 2
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] ?? ""}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {/* Confirmar asistencia — funciona para alumna, alumna+invitada
                      (1 check-in cubre a las dos) y walk-in. */}
                  {(r.status === "confirmed" || r.status === "waitlist") && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-emerald-600 hover:bg-emerald-50"
                      title={memberHasGuest ? `Confirmar asistencia (${memberName} + ${guestName})` : "Confirmar asistencia"}
                      onClick={() => checkinMutation.mutate(bookingId)}
                      disabled={checkinMutation.isPending}
                    >
                      <CheckCircle2 size={13} />
                    </Button>
                  )}
                  {r.status === "checked_in" && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-[#f87171]/70 hover:bg-[#f87171]/10"
                      title="Marcar como no asistió"
                      onClick={() => { if (window.confirm("¿Marcar como NO asistió? (revierte la asistencia)")) noShowMutation.mutate(bookingId); }}
                      disabled={noShowMutation.isPending}
                    >
                      <UserX size={13} />
                    </Button>
                  )}
                  {canEditGuest && (
                    memberHasGuest ? (
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 text-[#260910]"
                        title={`Quitar a ${guestName}`}
                        onClick={() => {
                          if (window.confirm(`¿Quitar a ${guestName} de la reserva de ${memberName}? Se libera 1 lugar y se devuelve 1 crédito si aplica.`)) {
                            removeGuestMutation.mutate(bookingId);
                          }
                        }}
                        disabled={removeGuestMutation.isPending}
                      >
                        <UserMinus size={11} />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 text-[#3B0E1A]"
                        title="Agregar invitada"
                        onClick={() => {
                          setGuestEditor({ bookingId, userName: memberName ?? "esta alumna" });
                          setGuestEditorName("");
                          setGuestEditorPhone("");
                        }}
                      >
                        <UserPlus size={11} />
                      </Button>
                    )
                  )}
                  {isWalkIn && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                      onClick={() => cancelWalkInMutation.mutate(bookingId)}
                      disabled={cancelWalkInMutation.isPending}>
                      <X size={11} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: agregar invitada a una reserva de alumna existente */}
      <Dialog
        open={!!guestEditor}
        onOpenChange={(o) => { if (!o) { setGuestEditor(null); setGuestEditorName(""); setGuestEditorPhone(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar invitada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {guestEditor && (
              <p className="text-xs text-muted-foreground">
                Reserva de <strong className="text-[#1A060B]">{guestEditor.userName}</strong>. Se descuenta 1 crédito de su paquete y se ocupa 1 lugar adicional en la clase.
              </p>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Nombre de la invitada *</Label>
              <Input
                value={guestEditorName}
                onChange={(e) => setGuestEditorName(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono (opcional)</Label>
              <Input
                value={guestEditorPhone}
                onChange={(e) => setGuestEditorPhone(e.target.value)}
                maxLength={40}
                type="tel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestEditor(null)}>Cancelar</Button>
            <Button
              disabled={!guestEditorName.trim() || addGuestMutation.isPending}
              onClick={() => guestEditor && addGuestMutation.mutate({
                bookingId: guestEditor.bookingId,
                guestName: guestEditorName.trim(),
                guestPhone: guestEditorPhone.trim() || undefined,
              })}
            >
              {addGuestMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Agregar invitada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ClassesCalendar = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabKey>("calendar");

  // Datos casi estáticos: cachear 5 min para evitar refetch en cada foco.
  // Las mutaciones (crear/editar tipo o instructora) ya invalidan estas keys.
  const { data: typesData } = useQuery<{ data: ClassType[] }>({
    queryKey: ["class-types"],
    queryFn: async () => (await api.get("/class-types")).data,
    staleTime: 5 * 60_000,
  });
  const types = Array.isArray(typesData?.data) ? typesData.data : [];

  const { data: instructorsData } = useQuery<{ data: { id: string; displayName: string }[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
    staleTime: 5 * 60_000,
  });
  const instructors = Array.isArray(instructorsData?.data) ? instructorsData.data : [];

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="admin-title font-bold text-[#260910]">Clases</h1>
              <p className="mt-1 text-xs text-[#260910]/55 sm:text-sm">Gestiona calendario, tipos, generación semanal e instructoras.</p>
              <div className="mt-3"><CourtesyButton /></div>
            </div>
            <div className="w-full sm:w-auto overflow-x-auto">
              <div className="flex min-w-max items-center gap-1 border-b border-[#3B0E1A]/15">
              {TABS.map(({ key, label, icon: Icon }) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors -mb-px border-b-2 sm:px-4",
                      active
                        ? "text-[#260910] border-[#3B0E1A]"
                        : "text-[#260910]/55 border-transparent hover:text-[#260910]"
                    )}
                  >
                    <Icon size={14} />
                    {isMobile
                      ? key === "types" ? "Tipos" : key === "generate" ? "Generar" : label
                      : label}
                  </button>
                );
              })}
              </div>
            </div>
          </div>

          {tab === "calendar" && <CalendarTab types={types} instructors={instructors} toast={toast} qc={qc} />}
          {tab === "types" && <TypesTab types={types} toast={toast} qc={qc} />}
          {tab === "generate" && <GenerateTab types={types} instructors={instructors} toast={toast} />}
          {tab === "instructors" && <InstructorsTab toast={toast} qc={qc} />}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   TAB 1 – CALENDAR
   ═══════════════════════════════════════════════════════════════════ */
function CalendarTab({
  types,
  instructors,
  toast,
  qc,
}: {
  types: ClassType[];
  instructors: { id: string; displayName: string }[];
  toast: any;
  qc: any;
}) {
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(studioNow(), { weekStartsOn: 1 }));
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedClass, setSelectedClass] = useState<ClassInstance | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileDay, setMobileDay] = useState(() => format(studioNow(), "yyyy-MM-dd"));

  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data } = useQuery<{ data: ClassInstance[] }>({
    queryKey: ["classes", start, end],
    // Cachear 60s: evita re-pedir la semana en cada foco/montaje. Las
    // mutaciones (crear/cancelar clase) ya invalidan ["classes"].
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get("/classes?start=" + start + "&end=" + end);
      const raw: any[] = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      // Normalise snake_case → camelCase expected by ClassInstance
      const mapped: ClassInstance[] = raw.map((c: any) => ({
        id:               c.id,
        classTypeId:      c.class_type_id,
        classTypeName:    c.class_type_name,
        classTypeColor:   c.class_type_color,
        instructorId:     c.instructor_id,
        instructorName:   c.instructor_name,
        instructorPhoto:  c.instructor_photo,
        startTime:        c.start_time,   // already full ISO from server normalisation
        endTime:          c.end_time,
        maxCapacity:      c.max_capacity ?? c.capacity ?? 10,
        capacity:         c.max_capacity ?? c.capacity ?? 10,
        bookedCount:      c.current_bookings ?? 0,
        currentBookings:  c.current_bookings ?? 0,
        isCancelled:      c.status === "cancelled" || c.is_cancelled === true,
        notes:            c.notes,
      }));
      return { data: mapped };
    },
  });
  const classes = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<ClassFormData>({ resolver: zodResolver(classSchema) });

  const createMutation = useMutation({
    mutationFn: (d: ClassFormData) => api.post("/classes", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase creada" });
      setCreateOpen(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put("/classes/" + id + "/cancel"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase cancelada" });
      setSheetOpen(false);
    },
  });

  // Borrar (físico) — distinto a "Cancelar". Cancelar deja la clase con
  // status='cancelled' visible para historial; Borrar la elimina por
  // completo junto con sus reservas. Para clases que no se imparten.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete("/admin/classes/" + id),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const bookings = Number(res?.data?.deleted_bookings ?? 0);
      toast({
        title: "Clase eliminada",
        description: bookings > 0 ? `Se borraron también ${bookings} reserva${bookings === 1 ? "" : "s"} asociada${bookings === 1 ? "" : "s"}.` : undefined,
      });
      setSheetOpen(false);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "No se pudo borrar la clase";
      toast({ title: message, variant: "destructive" });
    },
  });

  const clearWeekMutation = useMutation({
    mutationFn: () => api.delete("/classes/week", { data: { startDate: start, endDate: end } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const deleted = Number(res?.data?.deleted ?? 0);
      toast({
        title: deleted === 1 ? "1 clase eliminada de la semana" : `${deleted} clases eliminadas de la semana`,
      });
      setSheetOpen(false);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "No se pudo limpiar la semana";
      toast({ title: message, variant: "destructive" });
    },
  });

  // Duplicar la semana actual hacia N semanas adelante.
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateWeeks, setDuplicateWeeks] = useState(1);
  const duplicateWeekMutation = useMutation({
    mutationFn: (weeksAhead: number) =>
      api.post("/admin/classes/duplicate-week", { sourceWeekStart: start, weeksAhead }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const created = Number(res?.data?.data?.created ?? 0);
      const skipped = Number(res?.data?.data?.skipped ?? 0);
      const weeks = Number(res?.data?.data?.weeksAhead ?? 0);
      toast({
        title: `Semana duplicada × ${weeks}`,
        description: skipped > 0
          ? `${created} clases creadas · ${skipped} saltadas por duplicado.`
          : `${created} clases creadas.`,
      });
      setDuplicateOpen(false);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message ?? "No se pudo duplicar la semana";
      toast({ title: message, variant: "destructive" });
    },
  });

  // Cambiar instructor de una clase. Si el server detecta cambio real, notifica
  // por email + WhatsApp a las alumnas con reserva activa.
  const [newInstructorId, setNewInstructorId] = useState<string>("");
  const changeInstructorMutation = useMutation({
    mutationFn: ({ classId, instructorId }: { classId: string; instructorId: string }) =>
      api.put(`/admin/classes/${classId}`, { instructorId, notifyAttendees: true }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const notified = Number(res?.data?.notifiedCount ?? 0);
      toast({
        title: "Instructora actualizada",
        description: notified > 0
          ? `Se notificó a ${notified} alumna${notified === 1 ? "" : "s"} por email${notified === 1 ? "" : ""} y WhatsApp.`
          : "Sin alumnas reservadas a notificar.",
      });
      setSheetOpen(false);
      setNewInstructorId("");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "No se pudo cambiar la instructora";
      toast({ title: message, variant: "destructive" });
    },
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const classesForDay = (date: Date) =>
    classes.filter((c) => c.startTime?.startsWith(format(date, "yyyy-MM-dd")));

  useEffect(() => {
    const currentWeekDays = days.map((d) => format(d, "yyyy-MM-dd"));
    if (!currentWeekDays.includes(mobileDay)) {
      setMobileDay(currentWeekDays[0]);
    }
  }, [weekStart, mobileDay, days]);

  const openCreate = (date: string) => {
    setSelectedDate(date);
    form.reset({ startTime: date + "T09:00", endTime: date + "T10:00", maxCapacity: 10 });
    setCreateOpen(true);
  };

  const shiftWeek = (offset: number) => {
    const next = addDays(weekStart, offset);
    setWeekStart(next);
    if (isMobile) setMobileDay(format(next, "yyyy-MM-dd"));
  };

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} – ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`;

  const handleClearWeek = () => {
    if (classes.length === 0 || clearWeekMutation.isPending) return;
    const confirmed = window.confirm(
      `Esto eliminará todas las clases de la semana (${weekLabel}). Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    clearWeekMutation.mutate();
  };

  const mobileDayDate = parseISO(mobileDay);
  const mobileClasses = classes.filter((c) => c.startTime?.startsWith(mobileDay));

  return (
    <>
      {/* Week nav */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <button
            onClick={() => shiftWeek(-7)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#260910]/60 hover:bg-[#3B0E1A]/8 hover:text-[#260910] transition-colors"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-center text-xs font-medium text-[#260910] tabular-nums sm:text-sm">{weekLabel}</span>
          <button
            onClick={() => shiftWeek(7)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#260910]/60 hover:bg-[#3B0E1A]/8 hover:text-[#260910] transition-colors"
            aria-label="Semana siguiente"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-4 sm:justify-end">
          <button
            type="button"
            onClick={() => setDuplicateOpen(true)}
            disabled={duplicateWeekMutation.isPending || classes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#3B0E1A] px-3.5 py-1.5 text-xs font-medium text-[#EADCDD] hover:bg-[#320C16] transition-colors disabled:opacity-30 disabled:hover:bg-[#3B0E1A]"
            title="Copiar todas las clases de esta semana a las siguientes"
          >
            {duplicateWeekMutation.isPending
              ? <><Loader2 size={13} className="animate-spin" /> Copiando…</>
              : <><Copy size={13} /> Copiar semana</>}
          </button>
          <button
            type="button"
            onClick={handleClearWeek}
            disabled={clearWeekMutation.isPending || classes.length === 0}
            className="text-xs text-[#260910]/50 hover:text-destructive underline-offset-2 hover:underline transition-colors disabled:opacity-30 disabled:hover:no-underline disabled:hover:text-[#260910]/50"
          >
            {clearWeekMutation.isPending ? "Limpiando…" : "Limpiar semana"}
          </button>
        </div>
      </div>

      {/* Duplicate-week dialog */}
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar semana</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-[#260910]/75 leading-relaxed">
              Se copiarán las <strong>{classes.length} clases</strong> de la semana <strong>{weekLabel}</strong> a las siguientes, manteniendo tipo, instructora, hora y capacidad. Si una clase idéntica ya existe en la semana destino, se salta.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-[#260910]/70">¿Cuántas semanas adelante?</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={duplicateWeeks}
                  onChange={(e) => {
                    const n = parseInt(e.target.value || "1", 10);
                    if (!Number.isNaN(n)) setDuplicateWeeks(Math.max(1, Math.min(12, n)));
                  }}
                  className="w-24"
                />
                <span className="text-xs text-[#260910]/55">
                  semana{duplicateWeeks === 1 ? "" : "s"} (máx 12)
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-[#C9A5A8]/10 border border-[#C9A5A8]/25 px-3 py-2 text-[11px] text-[#260910] leading-snug">
              Atajos:{" "}
              {[1, 2, 4, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDuplicateWeeks(n)}
                  className={`ml-1 underline-offset-2 hover:underline ${duplicateWeeks === n ? "font-semibold text-[#3B0E1A]" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)} disabled={duplicateWeekMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => duplicateWeekMutation.mutate(duplicateWeeks)}
              disabled={duplicateWeekMutation.isPending || classes.length === 0}
              className="bg-gradient-to-r from-[#C9A5A8] to-[#3B0E1A] text-white"
            >
              {duplicateWeekMutation.isPending
                ? "Copiando…"
                : `Copiar a ${duplicateWeeks} semana${duplicateWeeks === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isMobile ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-2">
            <div className="flex min-w-max gap-2">
              {days.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const isActive = dayKey === mobileDay;
                const count = classesForDay(day).length;
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => setMobileDay(dayKey)}
                    className={cn(
                      "flex min-h-[52px] min-w-[76px] flex-col items-center justify-center rounded-xl border px-2 text-xs transition-colors",
                      isActive
                        ? "border-[#3B0E1A]/60 bg-gradient-to-r from-[#3B0E1A]/20 to-[#C9A5A8]/20 text-[#1A060B]"
                        : "border-[#3B0E1A]/15 bg-[#3B0E1A]/10 text-[#1A060B]/70",
                    )}
                  >
                    <span className="text-[10px] uppercase">{DAYS_ES[day.getDay()]}</span>
                    <span className="text-base font-bold leading-none">{format(day, "d")}</span>
                    <span className="mt-0.5 text-[10px] text-[#1A060B]/55">{count} cls</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#1A060B]/45">{DAYS_ES[mobileDayDate.getDay()]}</p>
                <p className="text-sm font-semibold text-[#1A060B]">{format(mobileDayDate, "d 'de' MMMM", { locale: es })}</p>
              </div>
              <Button size="sm" className="h-9" onClick={() => openCreate(mobileDay)}>
                <Plus size={14} className="mr-1" /> Nueva
              </Button>
            </div>

            {mobileClasses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#3B0E1A]/15 p-6 text-center text-xs text-[#1A060B]/45">
                Sin clases programadas para este día.
              </div>
            ) : (
              <div className="space-y-2">
                {mobileClasses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedClass(c); setSheetOpen(true); }}
                    className="w-full rounded-xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/10 p-3 text-left"
                    style={{ borderLeftColor: c.classTypeColor ?? "#C9A5A8", borderLeftWidth: 3 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="truncate text-sm font-semibold text-[#1A060B]">{c.classTypeName ?? "Clase"}</p>
                          <ClassCategoryBadge classTypeName={c.classTypeName ?? ""} />
                        </div>
                        <p className="text-xs text-[#1A060B]/60">
                          {c.startTime ? format(parseISO(c.startTime), "HH:mm") : "—"}
                          {" - "}
                          {c.endTime ? format(parseISO(c.endTime), "HH:mm") : "—"}
                        </p>
                      </div>
                      <Badge variant={c.isCancelled ? "destructive" : "secondary"} className="text-[10px]">
                        {c.isCancelled ? "Cancelada" : "Activa"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {c.instructorPhoto ? (
                        <img
                          src={c.instructorPhoto}
                          alt={c.instructorName ?? ""}
                          className="h-6 w-6 rounded-full object-cover ring-1 ring-white/25"
                        />
                      ) : (
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[0.6rem] font-bold text-[#1A060B]"
                          style={{ background: c.classTypeColor ?? "#C9A5A8" }}
                        >
                          {(c.instructorName ?? "?")[0].toUpperCase()}
                        </span>
                      )}
                      <span className="truncate text-xs text-[#1A060B]/60">{c.instructorName ?? "—"}</span>
                      <span className="ml-auto text-xs text-[#1A060B]/55">
                        {(c.bookedCount ?? c.currentBookings ?? 0)}/{c.maxCapacity ?? c.capacity ?? "?"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {days.map((day, i) => {
              const dayClasses = classesForDay(day);
              const isToday = isSameDay(day, studioNow());
              return (
                <div key={i} className="min-h-[320px]">
                  <div
                    className="mb-3 flex cursor-pointer flex-col items-center group"
                    onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                  >
                    <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#260910]/45">
                      {DAYS_ES[day.getDay()]}
                    </span>
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full font-bebas text-2xl leading-none tabular-nums transition-colors",
                        isToday
                          ? "bg-[#3B0E1A] text-[#EADCDD]"
                          : "text-[#260910] group-hover:bg-[#3B0E1A]/8",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {dayClasses.map((c) => {
                      const booked = c.bookedCount ?? c.currentBookings ?? 0;
                      const cap    = c.maxCapacity ?? c.capacity ?? 7;
                      const accent = c.classTypeColor ?? "#3B0E1A";
                      return (
                        <div
                          key={c.id}
                          onClick={() => { setSelectedClass(c); setSheetOpen(true); }}
                          className="cursor-pointer rounded-xl border border-[#3B0E1A]/12 bg-white p-2.5 transition-all hover:-translate-y-0.5 hover:border-[#3B0E1A]/40"
                          style={{ boxShadow: "0 2px 8px rgba(114,93,81,0.06)" }}
                        >
                          <div className="mb-0.5 flex items-baseline justify-between gap-1.5">
                            <span className="font-bebas text-base leading-none tabular-nums text-[#260910]">
                              {c.startTime ? format(parseISO(c.startTime), "HH:mm") : "—"}
                            </span>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className="truncate text-[11px] font-medium leading-tight text-[#260910]">
                              {c.classTypeName ?? "Clase"}
                            </p>
                            <ClassCategoryBadge classTypeName={c.classTypeName ?? ""} />
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            {c.instructorPhoto ? (
                              <img src={c.instructorPhoto} alt="" className="h-4 w-4 rounded-full object-cover" />
                            ) : (
                              <span
                                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-[#EADCDD]"
                                style={{ background: accent }}
                              >
                                {(c.instructorName ?? "?")[0].toUpperCase()}
                              </span>
                            )}
                            <span className="truncate text-[10px] text-[#260910]/65">{c.instructorName ?? "—"}</span>
                          </div>
                          {/* Dots de ocupación */}
                          <div className="mt-1.5 flex items-center gap-[2px]">
                            {Array.from({ length: cap }).map((_, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  "h-1 flex-1 rounded-full",
                                  idx < booked ? "bg-[#3B0E1A]" : "bg-[#C9A5A8]/30",
                                )}
                              />
                            ))}
                            <span className="ml-1 shrink-0 text-[9px] font-medium tabular-nums text-[#260910]/55">
                              {booked}/{cap}
                            </span>
                          </div>
                          {c.isCancelled && (
                            <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-destructive">Cancelada</p>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                      className="flex w-full items-center justify-center rounded-lg py-1.5 text-[#3B0E1A]/35 transition-colors hover:bg-[#3B0E1A]/[0.06] hover:text-[#3B0E1A]/70"
                      aria-label="Crear clase"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva clase</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Tipo de clase</Label>
              <Select onValueChange={(v) => form.setValue("classTypeId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Instructor</Label>
              <Select onValueChange={(v) => form.setValue("instructorId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar instructor" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Inicio</Label><Input type="datetime-local" {...form.register("startTime")} /></div>
              <div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" {...form.register("endTime")} /></div>
            </div>
            <div className="space-y-1"><Label>Capacidad máxima</Label><Input type="number" {...form.register("maxCapacity")} /></div>
            <div className="space-y-1"><Label>Notas</Label><Input {...form.register("notes")} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-gradient-to-r from-[#C9A5A8] to-[#3B0E1A] text-white">Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={(v) => { setSheetOpen(v); if (!v) setNewInstructorId(""); }}>
        <SheetContent>
          <SheetHeader><SheetTitle>{selectedClass?.classTypeName ?? "Clase"}</SheetTitle></SheetHeader>
          {selectedClass && (
            <div className="mt-6 space-y-4 text-sm">
              {/* Instructor with avatar */}
              <div className="flex items-center gap-3">
                {selectedClass.instructorPhoto ? (
                  <img src={selectedClass.instructorPhoto} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-offset-1" style={{ outline: `2px solid ${selectedClass.classTypeColor ?? "#C9A5A8"}` }} />
                ) : (
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[#1A060B] text-sm" style={{ background: selectedClass.classTypeColor ?? "#C9A5A8" }}>
                    {(selectedClass.instructorName ?? "?")[0].toUpperCase()}
                  </span>
                )}
                <div>
                  <div className="font-medium">{selectedClass.instructorName ?? selectedClass.instructorId}</div>
                  <div className="text-xs text-muted-foreground">Instructor</div>
                </div>
              </div>
              <div><span className="font-medium">Inicio:</span> {selectedClass.startTime ? new Date(selectedClass.startTime).toLocaleString("es-MX", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
              <div><span className="font-medium">Cupo:</span> {(selectedClass.bookedCount ?? selectedClass.currentBookings ?? 0) + " / " + (selectedClass.maxCapacity ?? selectedClass.capacity ?? "?")}</div>
              {selectedClass.notes && <div><span className="font-medium">Notas:</span> {selectedClass.notes}</div>}

              {/* ── Attendees list ── */}
              <ClassAttendees classId={selectedClass.id} />

              {/* ── Cambio de instructora ── */}
              {!selectedClass.isCancelled && (
                <div className="pt-2 border-t border-[#3B0E1A]/15 mt-2">
                  <Label className="text-xs uppercase tracking-wide text-[#260910]/70">Cambiar instructora</Label>
                  <p className="text-[11px] text-[#260910]/55 mt-1 mb-2 leading-snug">
                    Las alumnas reservadas serán notificadas automáticamente por email y WhatsApp.
                  </p>
                  <div className="flex gap-2">
                    <Select
                      value={newInstructorId}
                      onValueChange={setNewInstructorId}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecciona instructora" />
                      </SelectTrigger>
                      <SelectContent>
                        {instructors
                          .filter((inst) => inst.id !== selectedClass.instructorId)
                          .map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => {
                        if (!newInstructorId) {
                          toast({ title: "Selecciona una instructora antes de confirmar.", variant: "destructive" });
                          return;
                        }
                        const newName = instructors.find((i) => i.id === newInstructorId)?.displayName ?? "la instructora";
                        if (!window.confirm(`¿Cambiar a "${newName}" y notificar a las alumnas reservadas?`)) return;
                        changeInstructorMutation.mutate({ classId: selectedClass.id, instructorId: newInstructorId });
                      }}
                      disabled={changeInstructorMutation.isPending || !newInstructorId}
                      className="bg-[#3B0E1A] text-white hover:bg-[#260910]"
                    >
                      {changeInstructorMutation.isPending ? "..." : "Cambiar"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                {!selectedClass.isCancelled && (
                  <Button variant="destructive" onClick={() => cancelMutation.mutate(selectedClass.id)} disabled={cancelMutation.isPending}>
                    Cancelar clase
                  </Button>
                )}
                {selectedClass.isCancelled && <Badge variant="destructive">Clase cancelada</Badge>}
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    const msg = "Esta acción borra la clase de la base de datos junto con sus reservas. No se puede deshacer.\n\n¿Borrar definitivamente?";
                    if (window.confirm(msg)) deleteMutation.mutate(selectedClass.id);
                  }}
                >
                  {deleteMutation.isPending ? "Borrando..." : "Borrar clase (definitivo)"}
                </Button>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Borrar es <strong>distinto</strong> a cancelar: cancelar la deja en el historial como "cancelada"; borrar la elimina por completo.
                </p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 2 – CLASS TYPES
   ═══════════════════════════════════════════════════════════════════ */
function TypesTab({ types, toast, qc }: { types: ClassType[]; toast: any; qc: any }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassType | null>(null);
  const form = useForm<TypeFormData>({
    resolver: zodResolver(typeSchema),
    defaultValues: { color: "#C9A5A8", category: "pilates", defaultDuration: 50, maxCapacity: 10, isActive: true },
  });

  const createMutation = useMutation({
    mutationFn: (d: TypeFormData) => api.post("/class-types", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo creado" });
      setOpen(false);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => api.put("/class-types/" + id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo actualizado" });
      setOpen(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete("/class-types/" + id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo eliminado" });
    },
  });

  const openEdit = (t: ClassType) => {
    form.reset({
      name: t.name,
      color: t.color,
      category: (t.category === "pilates" ? "pilates" : "bienestar") as "pilates" | "bienestar",
      defaultDuration: t.defaultDuration ?? t.durationMin ?? 50,
      maxCapacity: t.maxCapacity ?? t.capacity ?? 10,
      isActive: t.isActive ?? true,
    });
    setEditing(t);
    setOpen(true);
  };
  const openCreate = () => {
    form.reset({ color: "#C9A5A8", category: "pilates", defaultDuration: 50, maxCapacity: 10, isActive: true });
    setEditing(null);
    setOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <p className="text-sm text-muted-foreground">{types.length} tipos registrados</p>
        <Button size="sm" onClick={openCreate} className="bg-gradient-to-r from-[#C9A5A8] to-[#3B0E1A] text-white">
          <Plus size={14} className="mr-1" />Nuevo tipo
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {types.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#3B0E1A]/15 p-6 text-center text-xs text-[#1A060B]/45">
              Sin tipos registrados.
            </div>
          ) : (
            types.map((t) => (
              <div key={t.id} className="rounded-xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <p className="truncate text-sm font-semibold text-[#1A060B]">{t.name}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.category === "bienestar" && <Badge className="bg-[#3B0E1A]/20 text-[#3B0E1A] border border-[#3B0E1A]/30">Bienestar</Badge>}
                      {t.category === "pilates" && <Badge className="bg-[#C9A5A8]/20 text-[#C9A5A8] border border-[#C9A5A8]/30">Pilates</Badge>}
                      {!t.category && <Badge variant="secondary">—</Badge>}
                      <Badge variant="outline">{(t.defaultDuration ?? t.durationMin ?? "—") + " min"}</Badge>
                      <Badge variant="outline">{(t.maxCapacity ?? t.capacity ?? "—") + " cupos"}</Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este tipo de clase?")) deleteMutation.mutate(t.id); }}>Eliminar</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-2">
                  <Badge
                    variant={t.isActive !== false ? "default" : "secondary"}
                    className={t.isActive !== false ? "bg-[#C9A5A8]/20 text-[#C9A5A8] border border-[#C9A5A8]/30" : ""}
                  >
                    {t.isActive !== false ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Color</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><div className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: t.color }} /></TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    {t.category === "bienestar" && <Badge className="bg-[#3B0E1A]/20 text-[#3B0E1A] border border-[#3B0E1A]/30">Bienestar</Badge>}
                    {t.category === "pilates" && <Badge className="bg-[#C9A5A8]/20 text-[#C9A5A8] border border-[#C9A5A8]/30">Pilates</Badge>}
                    {!t.category && <Badge variant="secondary">—</Badge>}
                  </TableCell>
                  <TableCell>{(t.defaultDuration ?? t.durationMin ?? "—") + " min"}</TableCell>
                  <TableCell>{t.maxCapacity ?? t.capacity ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={t.isActive !== false ? "default" : "secondary"}
                      className={t.isActive !== false ? "bg-[#C9A5A8]/20 text-[#C9A5A8] border border-[#C9A5A8]/30" : ""}
                    >
                      {t.isActive !== false ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este tipo de clase?")) deleteMutation.mutate(t.id); }}>Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* CRUD dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar tipo" : "Nuevo tipo de clase"}</DialogTitle></DialogHeader>
          <form
            onSubmit={form.handleSubmit((d) =>
              editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d)
            )}
            className="space-y-4"
          >
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v as "pilates" | "bienestar")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pilates">Pilates</SelectItem>
                  <SelectItem value="bienestar">Bienestar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => form.setValue("color", c.value)}
                    className={
                      "w-8 h-8 rounded-full border-2 transition-all " +
                      (form.watch("color") === c.value
                        ? "border-foreground scale-110 ring-2 ring-offset-2 ring-offset-background ring-[#C9A5A8]"
                        : "border-transparent opacity-70 hover:opacity-100")
                    }
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
              <Input type="color" {...form.register("color")} className="h-8 w-16 cursor-pointer" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Duración (min)</Label><Input type="number" {...form.register("defaultDuration")} /></div>
              <div className="space-y-1"><Label>Capacidad máx.</Label><Input type="number" {...form.register("maxCapacity")} /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
              <Label>Activo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-gradient-to-r from-[#C9A5A8] to-[#3B0E1A] text-white">
                {editing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 3 – GENERATE WEEK  (beautiful version)
   ═══════════════════════════════════════════════════════════════════ */
function GenerateTab({
  types,
  instructors,
  toast,
}: {
  types: ClassType[];
  instructors: { id: string; displayName: string }[];
  toast: any;
}) {
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [classTypeId, setClassTypeId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(10);

  const selectedType = types.find((t) => t.id === classTypeId);
  const selectedInstructor = instructors.find((i) => i.id === instructorId);

  // Preview: how many classes will be generated
  const preview = useMemo(() => {
    if (!startDate || !endDate || !selectedDays.length) return [];
    try {
      const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate),
      });
      return days.filter((d) => selectedDays.includes(d.getDay()));
    } catch {
      return [];
    }
  }, [startDate, endDate, selectedDays]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/classes/generate", {
        classTypeId,
        instructorId,
        startDate,
        endDate,
        daysOfWeek: selectedDays,
        startTime,
        endTime,
        maxCapacity,
      }),
    onSuccess: (res: any) => toast({ title: `✨ ${res.data?.created ?? 0} clases generadas` }),
    onError: (error: any) =>
      toast({
        title: error?.response?.data?.message ?? "Error generando clases",
        variant: "destructive",
      }),
  });

  const toggleDay = (v: number) => {
    setSelectedDays((prev) =>
      prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]
    );
  };

  const canGenerate = classTypeId && instructorId && startDate && endDate && selectedDays.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#C9A5A8]/10 to-[#3B0E1A]/10 border border-[#C9A5A8]/20 mb-3">
          <Sparkles size={14} className="text-[#EADCDD]" />
          <span className="text-xs font-semibold text-[#C9A5A8]">Generador de clases</span>
        </div>
        <h2 className="text-2xl font-bold text-[#1A060B]">Generar clases en bloque</h2>
        <p className="text-sm text-[#1A060B]/40 mt-1">Selecciona tipo, instructor, rango de fechas y días</p>
      </div>

      {/* ── Step 1: Class type + Instructor ── */}
      <div className="rounded-2xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#C9A5A8]/20 text-[#C9A5A8] text-xs font-bold">1</span>
          <span className="text-xs font-semibold text-[#C9A5A8]/70 uppercase tracking-wider">Clase e instructor</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Tipo de clase</Label>
            <Select onValueChange={setClassTypeId}>
              <SelectTrigger className="bg-[#3B0E1A]/[0.06] border-[#3B0E1A]/15 text-[#1A060B]">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Instructor</Label>
            <Select onValueChange={setInstructorId}>
              <SelectTrigger className="bg-[#3B0E1A]/[0.06] border-[#3B0E1A]/15 text-[#1A060B]">
                <SelectValue placeholder="Seleccionar instructor" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Step 2: Date range ── */}
      <div className="rounded-2xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#3B0E1A]/20 text-[#3B0E1A] text-xs font-bold">2</span>
          <span className="text-xs font-semibold text-[#3B0E1A]/70 uppercase tracking-wider">Rango de fechas</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Fecha inicio</Label>
            <DatePicker value={startDate} onChange={setStartDate} placeholder="Desde" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Fecha fin</Label>
            <DatePicker value={endDate} onChange={setEndDate} placeholder="Hasta" min={startDate} />
          </div>
        </div>
      </div>

      {/* ── Step 3: Days of week ── */}
      <div className="rounded-2xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#EADCDD]/20 text-[#EADCDD] text-xs font-bold">3</span>
          <span className="text-xs font-semibold text-[#EADCDD]/70 uppercase tracking-wider">Días de la semana</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {GENERATE_DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={
                "relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-all " +
                (selectedDays.includes(d.value)
                  ? "bg-gradient-to-r from-[#3B0E1A] to-[#C9A5A8] text-white shadow-[0_0_12px_rgba(131,106,93,0.3)]"
                  : "bg-[#3B0E1A]/[0.06] border border-[#3B0E1A]/15 text-[#1A060B]/45 hover:text-[#1A060B]/75 hover:border-[#3B0E1A]/25")
              }
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
            className="text-[10px] text-[#C9A5A8] font-medium hover:underline"
          >
            Lun–Vie
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays([1, 2, 3, 4, 5, 6])}
            className="text-[10px] text-[#C9A5A8] font-medium hover:underline"
          >
            Lun–Sáb
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
            className="text-[10px] text-[#C9A5A8] font-medium hover:underline"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays([])}
            className="text-[10px] text-[#1A060B]/30 font-medium hover:underline"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* ── Step 4: Time + Capacity ── */}
      <div className="rounded-2xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#3B0E1A]/20 text-[#3B0E1A] text-xs font-bold">4</span>
          <span className="text-xs font-semibold text-[#3B0E1A]/70 uppercase tracking-wider">Horario y capacidad</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Hora inicio</Label>
            <TimePicker value={startTime} onChange={setStartTime} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Hora fin</Label>
            <TimePicker value={endTime} onChange={setEndTime} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#1A060B]/60 text-xs">Capacidad máx.</Label>
            <Input
              type="number"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(Number(e.target.value))}
              className="bg-[#3B0E1A]/[0.06] border-[#3B0E1A]/15 text-[#1A060B] text-center"
            />
          </div>
        </div>
      </div>

      {/* ── Preview ── */}
      {preview.length > 0 && (
        <div className="rounded-2xl border border-[#C9A5A8]/20 bg-gradient-to-br from-[#C9A5A8]/5 to-[#3B0E1A]/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-[#EADCDD]" />
              <span className="text-xs font-semibold text-[#1A060B]/60 uppercase tracking-wider">Vista previa</span>
            </div>
            <Badge variant="outline" className="border-[#C9A5A8]/30 text-[#C9A5A8] font-bold">
              {preview.length} {preview.length === 1 ? "clase" : "clases"}
            </Badge>
          </div>

          <div className="hidden grid-cols-7 gap-1.5 sm:grid">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-[#1A060B]/25 uppercase">{d}</div>
            ))}
          </div>

          <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-7">
            {preview.map((d) => (
              <div
                key={d.toISOString()}
                className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg bg-[#3B0E1A]/[0.05] border border-[#3B0E1A]/12"
              >
                <span className="text-[10px] text-[#1A060B]/40">
                  {format(d, "MMM", { locale: es })}
                </span>
                <span className="text-sm font-bold text-[#1A060B]">
                  {format(d, "d")}
                </span>
                <span className="text-[9px] text-[#EADCDD]/60 font-medium">
                  {startTime}
                </span>
                {selectedType && (
                  <span
                    className="w-2 h-2 rounded-full mt-0.5"
                    style={{ backgroundColor: selectedType.color }}
                  />
                )}
              </div>
            ))}
          </div>

          {selectedType && (
            <div className="flex items-center gap-3 pt-2 border-t border-[#3B0E1A]/12">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedType.color }} />
              <span className="text-xs text-[#1A060B]/60">
                <strong className="text-[#1A060B]/80">{selectedType.name}</strong>
                {selectedInstructor && <> · {selectedInstructor.displayName}</>}
                {" · "}{startTime}–{endTime} · {maxCapacity} cupos
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Generate Button ── */}
      <button
        type="button"
        disabled={!canGenerate || generateMutation.isPending}
        onClick={() => generateMutation.mutate()}
        className={
          "w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-[#1A060B] transition-all " +
          (canGenerate
            ? "bg-gradient-to-r from-[#3B0E1A] to-[#C9A5A8] hover:opacity-90 shadow-[0_4px_20px_rgba(131,106,93,0.25)]"
            : "bg-[#3B0E1A]/[0.06] text-[#1A060B]/25 cursor-not-allowed")
        }
      >
        {generateMutation.isPending ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <Sparkles size={16} />
        )}
        {generateMutation.isPending
          ? "Generando…"
          : preview.length > 0
          ? `Generar ${preview.length} clases`
          : "Generar clases"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 4 – INSTRUCTORAS
   ═══════════════════════════════════════════════════════════════════ */
function InstructorsTab({ toast, qc }: { toast: any; qc: any }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: Instructor[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<InstructorFormData>({
    resolver: zodResolver(instructorSchema),
    defaultValues: { isActive: true, photoFocusX: 50, photoFocusY: 50 },
  });

  const createMutation = useMutation({
    mutationFn: (d: InstructorFormData) => api.post("/instructors", instructorPayload(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast({ title: "Instructora creada" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al crear instructora", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & InstructorFormData) =>
      api.put(`/instructors/${id}`, instructorPayload(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast({ title: "Instructora actualizada" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al actualizar instructora", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/instructors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructora eliminada" }); },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al eliminar instructora", variant: "destructive" });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("photo", file);
      return api.post(`/instructors/${id}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Foto actualizada" }); },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al subir foto", variant: "destructive" });
    },
  });

  const openEdit = (i: Instructor) => {
    form.reset({
      displayName: i.displayName ?? "",
      email: i.email ?? "",
      bio: i.bio ?? "",
      specialties: normalizeSpecialties(i.specialties).join(", "),
      isActive: i.isActive ?? true,
      photoFocusX: clampFocus(i.photoFocusX),
      photoFocusY: clampFocus(i.photoFocusY),
    });
    setEditing(i);
    setOpen(true);
  };
  const openCreate = () => {
    form.reset({ displayName: "", email: "", bio: "", specialties: "", isActive: true, photoFocusX: 50, photoFocusY: 50 });
    setEditing(null);
    setOpen(true);
  };
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const focusX = clampFocus(form.watch("photoFocusX"));
  const focusY = clampFocus(form.watch("photoFocusY"));
  const applyPreviewFocus = (event: React.PointerEvent<HTMLElement>) => {
    const next = getFocusFromPointerEvent(event);
    form.setValue("photoFocusX", next.x, { shouldDirty: true, shouldTouch: true });
    form.setValue("photoFocusY", next.y, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <p className="text-sm text-muted-foreground">{instructors.length} instructora{instructors.length !== 1 ? "s" : ""} registrada{instructors.length !== 1 ? "s" : ""}</p>
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-gradient-to-r from-[#C9A5A8] to-[#3B0E1A] text-white"
        >
          <Plus size={14} className="mr-1" />Nueva instructora
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileRef}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && uploadTarget) uploadPhotoMutation.mutate({ id: uploadTarget, file: f });
          e.target.value = "";
          setUploadTarget(null);
        }}
      />

      {isMobile ? (
        <div className="space-y-2">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : instructors.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#3B0E1A]/15 p-6 text-center text-xs text-[#1A060B]/45">
              Sin instructoras registradas.
            </div>
          ) : (
            instructors.map((ins) => (
              <div key={ins.id} className="rounded-xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {ins.photoUrl ? (
                        <img
                          src={ins.photoUrl}
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-[#C9A5A8]/30"
                          style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }}
                          alt=""
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A5A8] to-[#3B0E1A] text-xs font-bold text-[#1A060B]">
                          {ins.displayName?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1A060B]">{ins.displayName}</p>
                        <p className="truncate text-xs text-[#1A060B]/55">{ins.email}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[#1A060B]/55">{normalizeSpecialties(ins.specialties).join(", ") || "Sin especialidades"}</p>
                    <div className="mt-2">
                      <Badge
                        variant={ins.isActive ? "default" : "secondary"}
                        className={ins.isActive ? "bg-[#C9A5A8]/20 text-[#C9A5A8] border border-[#C9A5A8]/30" : ""}
                      >
                        {ins.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openEdit(ins)}>Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setUploadTarget(ins.id); setTimeout(() => fileRef.current?.click(), 50); }}>
                        Subir foto
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este instructor?")) deleteMutation.mutate(ins.id); }}>
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Especialidades</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array(4).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
                : instructors.map((ins) => (
                  <TableRow key={ins.id}>
                    <TableCell>
                      {ins.photoUrl ? (
                        <img
                          src={ins.photoUrl}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-[#C9A5A8]/30"
                          style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }}
                          alt=""
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#C9A5A8] to-[#3B0E1A] flex items-center justify-center text-xs font-bold text-[#1A060B]">
                          {ins.displayName?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{ins.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ins.email}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{normalizeSpecialties(ins.specialties).join(", ")}</TableCell>
                    <TableCell>
                      <Badge
                        variant={ins.isActive ? "default" : "secondary"}
                        className={ins.isActive ? "bg-[#C9A5A8]/20 text-[#C9A5A8] border border-[#C9A5A8]/30" : ""}
                      >
                        {ins.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => openEdit(ins)}>Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setUploadTarget(ins.id); setTimeout(() => fileRef.current?.click(), 50); }}>
                            Subir foto
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este instructor?")) deleteMutation.mutate(ins.id); }}>
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>
      )}

      {/* CRUD dialog */}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar instructora" : "Nueva instructora"}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            onSubmit={form.handleSubmit(
              (d) => {
                if (editing) {
                  updateMutation.mutate({ ...d, id: editing.id });
                  return;
                }
                createMutation.mutate(d);
              },
              (errors) => {
                const first = Object.values(errors)[0];
                toast({
                  title: first?.message ? String(first.message) : "Revisa los campos del formulario",
                  variant: "destructive",
                });
              },
            )}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input {...form.register("displayName")} />
              {form.formState.errors.displayName && (
                <p className="text-xs text-destructive">{String(form.formState.errors.displayName.message)}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{String(form.formState.errors.email.message)}</p>
              )}
            </div>
            <div className="space-y-1"><Label>Bio</Label><Input {...form.register("bio")} /></div>
            <div className="space-y-1">
              <Label>Especialidades (separadas por coma)</Label>
              <Input {...form.register("specialties")} placeholder="Ej: Pilates Reformer" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Enfoque horizontal</Label>
                <span className="text-xs text-muted-foreground">{focusX}%</span>
              </div>
              <Input
                type="range"
                min={0}
                max={100}
                step={1}
                value={focusX}
                onChange={(e) => form.setValue("photoFocusX", Number(e.target.value), { shouldDirty: true })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Enfoque vertical</Label>
                <span className="text-xs text-muted-foreground">{focusY}%</span>
              </div>
              <Input
                type="range"
                min={0}
                max={100}
                step={1}
                value={focusY}
                onChange={(e) => form.setValue("photoFocusY", Number(e.target.value), { shouldDirty: true })}
              />
            </div>
            {editing && (
              <div className="space-y-2 rounded-xl border border-dashed border-[#3B0E1A]/30 bg-[#3B0E1A]/[0.04] p-3">
                <Label>Foto de la instructora</Label>
                <p className="text-[11px] text-muted-foreground">JPG/PNG/WEBP, máx 20 MB. Se reemplaza la actual al subir.</p>
                <label className="block">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block w-full text-xs text-[#260910] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#3B0E1A] file:text-white file:font-medium hover:file:bg-[#260910] file:cursor-pointer disabled:opacity-50"
                    disabled={uploadPhotoMutation.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file || !editing) return;
                      if (file.size > 20 * 1024 * 1024) {
                        toast({ title: "El archivo debe pesar menos de 20 MB", variant: "destructive" });
                        e.target.value = "";
                        return;
                      }
                      uploadPhotoMutation.mutate({ id: editing.id, file });
                      e.target.value = "";
                    }}
                  />
                </label>
                {uploadPhotoMutation.isPending && (
                  <p className="text-xs text-[#3B0E1A] flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Subiendo foto…
                  </p>
                )}
              </div>
            )}
            {editing?.photoUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Vista previa y enfoque</Label>
                  <span className="text-[11px] text-muted-foreground">Haz clic o arrastra sobre la cara</span>
                </div>
                <button
                  type="button"
                  onPointerDown={applyPreviewFocus}
                  onPointerMove={(event) => {
                    if (event.buttons !== 1 && event.pointerType !== "touch") return;
                    applyPreviewFocus(event);
                  }}
                  className="group relative mx-auto block h-[360px] w-full max-w-[300px] touch-none overflow-hidden rounded-[28px] border border-[#3B0E1A]/15 bg-[#3B0E1A]/10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A5A8]"
                  aria-label="Seleccionar enfoque de la foto"
                >
                  <img
                    src={editing.photoUrl}
                    alt={editing.displayName}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    style={{ objectPosition: `${focusX}% ${focusY}%` }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <div
                    className="pointer-events-none absolute h-8 w-8 rounded-full border border-[#3B0E1A]/20 bg-[#3B0E1A]/10 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] backdrop-blur-sm"
                    style={{ left: `${focusX}%`, top: `${focusY}%`, transform: "translate(-50%, -50%)" }}
                  >
                    <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-[11px] font-medium text-[#1A060B]/80">
                    <span>X {focusX}%</span>
                    <span>Y {focusY}%</span>
                  </div>
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v, { shouldDirty: true })} />
              <Label>Activa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving} className="bg-gradient-to-r from-[#C9A5A8] to-[#3B0E1A] text-white">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ClassesCalendar;
