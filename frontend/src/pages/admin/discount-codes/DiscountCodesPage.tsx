import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  CircleAlert, Copy, Edit3, Eye, Loader2, Percent,
  Plus, Search, Tag, Trash2, Users, X,
} from "lucide-react";

type DiscountType = "percent" | "fixed";
type CouponFilter = "all" | "active" | "attention";

interface DiscountCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  usesCount: number;
  pendingReservations?: number;
  expiresAt: string | null;
  minOrderAmount: number;
  planId: string | null;
  planName: string | null;
  classCategory: string | null;
  channel: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PlanOption {
  id: string;
  name: string;
  price: number;
}

interface Redemption {
  orderId: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: string;
  createdAt: string;
  userId: string;
  userName: string;
  userEmail: string;
  planName: string | null;
}

interface FormState {
  code: string;
  discountType: DiscountType;
  discountValue: string;
  maxUses: string;
  expiresAt: string;
  minOrderAmount: string;
  planId: string;
  classCategory: string;
  channel: string;
  isActive: boolean;
}

interface CouponPayload {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  expiresAt: string | null;
  minOrderAmount: number;
  planId: string | null;
  classCategory: string | null;
  channel: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  code: "",
  discountType: "percent",
  discountValue: "10",
  maxUses: "",
  expiresAt: "",
  minOrderAmount: "",
  planId: "all",
  classCategory: "all",
  channel: "all",
  isActive: true,
};

const CHANNEL_LABEL: Record<string, string> = {
  all: "Todos los canales",
  membership: "Membresías web",
  pos: "Punto de venta",
  event: "Eventos",
};

const CATEGORY_LABEL: Record<string, string> = {
  all: "Todas las categorías",
  pilates: "Pilates",
  bienestar: "Bienestar",
  funcional: "Funcional",
  barre: "Barre",
  especial: "Especial",
  mixto: "Mixto",
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  approved: { label: "Aprobada", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  pending_payment: { label: "Esperando pago", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  pending_verification: { label: "Por verificar", tone: "border-amber-200 bg-amber-50 text-amber-800" },
  rejected: { label: "Rechazada", tone: "border-red-200 bg-red-50 text-red-800" },
  cancelled: { label: "Cancelada", tone: "border-slate-200 bg-slate-50 text-slate-600" },
  expired: { label: "Expirada", tone: "border-slate-200 bg-slate-50 text-slate-600" },
};

const PAYMENT_LABEL: Record<string, string> = {
  card: "Tarjeta",
  transfer: "Transferencia",
  cash: "Efectivo",
};

const money = (value: number | string) =>
  Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

const couponStatus = (coupon: DiscountCode) => {
  const pendingReservations = Number(coupon.pendingReservations || 0);
  const isExpired = Boolean(coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now());
  const remaining = coupon.maxUses === null
    ? null
    : Math.max(0, Number(coupon.maxUses) - Number(coupon.usesCount || 0) - pendingReservations);
  const exhausted = remaining === 0;

  if (isExpired) return { key: "expired", label: "Vencido", tone: "border-slate-200 bg-slate-100 text-slate-600", remaining, pendingReservations };
  if (exhausted) return { key: "exhausted", label: "Sin cupo", tone: "border-red-200 bg-red-50 text-red-700", remaining, pendingReservations };
  if (!coupon.isActive) return { key: "inactive", label: "Pausado", tone: "border-slate-200 bg-slate-100 text-slate-600", remaining, pendingReservations };
  return { key: "active", label: "Activo", tone: "border-emerald-200 bg-emerald-50 text-emerald-800", remaining, pendingReservations };
};

const discountLabel = (coupon: Pick<DiscountCode, "discountType" | "discountValue">) =>
  coupon.discountType === "percent" ? `${Number(coupon.discountValue)}%` : money(coupon.discountValue);

const formatExpiry = (value: string | null) =>
  value ? format(new Date(value), "d MMM yyyy", { locale: es }) : "Sin fecha límite";

const errorMessage = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { message?: string } } };
  return candidate?.response?.data?.message || fallback;
};

export default function DiscountCodesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [redemptionsFor, setRedemptionsFor] = useState<DiscountCode | null>(null);
  const [couponToDelete, setCouponToDelete] = useState<DiscountCode | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CouponFilter>("all");

  const codesQuery = useQuery({
    queryKey: ["admin-discount-codes"],
    queryFn: async () => (await api.get("/discount-codes")).data,
  });
  const codes = useMemo<DiscountCode[]>(
    () => (Array.isArray(codesQuery.data?.data) ? codesQuery.data.data : []),
    [codesQuery.data],
  );

  const plansQuery = useQuery({
    queryKey: ["coupon-plans"],
    queryFn: async () => (await api.get("/plans")).data,
    staleTime: 60_000,
  });
  const plans: PlanOption[] = Array.isArray(plansQuery.data?.data) ? plansQuery.data.data : [];

  const redemptionsQuery = useQuery({
    queryKey: ["admin-discount-redemptions", redemptionsFor?.id],
    queryFn: async () => (await api.get(`/discount-codes/${redemptionsFor?.id}/redemptions`)).data,
    enabled: Boolean(redemptionsFor),
    staleTime: 0,
  });
  const redemptions: Redemption[] = Array.isArray(redemptionsQuery.data?.data) ? redemptionsQuery.data.data : [];

  const refreshCodes = () => queryClient.invalidateQueries({ queryKey: ["admin-discount-codes"] });

  const createMutation = useMutation({
    mutationFn: (payload: CouponPayload) => api.post("/discount-codes", payload),
    onSuccess: () => {
      refreshCodes();
      toast({ title: "Cupón creado", description: "Ya está listo para usarse según sus reglas." });
      setIsFormOpen(false);
      setForm(emptyForm);
    },
    onError: (error: unknown) => toast({ title: errorMessage(error, "No se pudo crear el cupón"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: CouponPayload & { id: string }) => api.put(`/discount-codes/${id}`, payload),
    onSuccess: () => {
      refreshCodes();
      toast({ title: "Cupón actualizado" });
      setIsFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (error: unknown) => toast({ title: errorMessage(error, "No se pudo actualizar el cupón"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/discount-codes/${id}`),
    onSuccess: () => {
      refreshCodes();
      toast({ title: "Cupón eliminado" });
      setCouponToDelete(null);
    },
    onError: (error: unknown) => toast({ title: errorMessage(error, "No se pudo eliminar el cupón"), variant: "destructive" }),
  });

  const summary = useMemo(() => {
    const active = codes.filter((coupon) => couponStatus(coupon).key === "active").length;
    const attention = codes.filter((coupon) => ["expired", "exhausted", "inactive"].includes(couponStatus(coupon).key)).length;
    const redemptions = codes.reduce((sum, coupon) => sum + Number(coupon.usesCount || 0), 0);
    return { active, attention, redemptions };
  }, [codes]);

  const visibleCodes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return codes.filter((coupon) => {
      const status = couponStatus(coupon).key;
      const matchesFilter = filter === "all" || (filter === "active" ? status === "active" : status !== "active");
      const matchesSearch = !normalizedSearch || [coupon.code, coupon.planName, coupon.channel, coupon.classCategory]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesFilter && matchesSearch;
    });
  }, [codes, filter, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (coupon: DiscountCode) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      maxUses: coupon.maxUses === null ? "" : String(coupon.maxUses),
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
      minOrderAmount: Number(coupon.minOrderAmount) > 0 ? String(coupon.minOrderAmount) : "",
      planId: coupon.planId || "all",
      classCategory: coupon.classCategory || "all",
      channel: coupon.channel || "all",
      isActive: coupon.isActive,
    });
    setIsFormOpen(true);
  };

  const submitForm = () => {
    const discountValue = Number(form.discountValue);
    const maxUses = form.maxUses === "" ? null : Number(form.maxUses);
    const minOrderAmount = form.minOrderAmount === "" ? 0 : Number(form.minOrderAmount);

    if (!/^[A-Z0-9_-]{3,50}$/.test(form.code.trim().toUpperCase())) {
      toast({ title: "Usa 3 a 50 letras, números, guiones o guion bajo para el código", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(discountValue) || discountValue <= 0 || (form.discountType === "percent" && discountValue > 100)) {
      toast({ title: "Ingresa un descuento válido", variant: "destructive" });
      return;
    }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      toast({ title: "El límite de usos debe ser un entero mayor a cero", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
      toast({ title: "La compra mínima no es válida", variant: "destructive" });
      return;
    }

    const payload: CouponPayload = {
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue,
      maxUses,
      expiresAt: form.expiresAt || null,
      minOrderAmount,
      planId: form.planId === "all" ? null : form.planId,
      classCategory: form.classCategory === "all" ? null : form.classCategory,
      channel: form.channel,
      isActive: form.isActive,
    };

    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: `Código ${code} copiado` });
    } catch {
      toast({ title: "No se pudo copiar el código", variant: "destructive" });
    }
  };

  const formHasUnavailablePlan = Boolean(form.planId !== "all" && !plans.some((plan) => plan.id === form.planId));
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <main className="admin-page max-w-6xl space-y-6">
          <section className="flex flex-col gap-4 border-b border-[#3B0E1A]/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A5A5E]">
                <Tag size={13} /> Promociones
              </div>
              <h1 className="font-bebas text-[clamp(2rem,4vw,3rem)] leading-none tracking-[0.01em] text-[#1A060B]">Cupones</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#320C16]/70">
                Administra descuentos con reglas claras y ve el cupo realmente disponible antes de compartirlos.
              </p>
            </div>
            <Button onClick={openCreate} className="h-10 bg-[#3B0E1A] px-4 text-white hover:bg-[#260910]">
              <Plus size={16} className="mr-2" /> Nuevo cupón
            </Button>
          </section>

          <section className="grid gap-px overflow-hidden rounded-2xl border border-[#3B0E1A]/12 bg-[#3B0E1A]/12 sm:grid-cols-3">
            {[
              { label: "Activos", value: summary.active, hint: "disponibles ahora" },
              { label: "Por revisar", value: summary.attention, hint: "pausados, vencidos o sin cupo" },
              { label: "Usos confirmados", value: summary.redemptions, hint: "compras aprobadas" },
            ].map((item) => (
              <div key={item.label} className="bg-[#FCF8F7] px-4 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A5A5E]">{item.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#1A060B]">{item.value}</p>
                <p className="mt-0.5 text-[11px] text-[#320C16]/55">{item.hint}</p>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A5A5E]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 border-[#3B0E1A]/15 bg-white pl-9"
                  placeholder="Buscar por código, plan o canal"
                />
              </div>
              <div className="inline-flex w-full rounded-xl border border-[#3B0E1A]/12 bg-[#FCF8F7] p-1 sm:w-auto">
                {([
                  ["all", "Todos"],
                  ["active", "Activos"],
                  ["attention", "Por revisar"],
                ] as [CouponFilter, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none ${
                      filter === value ? "bg-[#3B0E1A] text-white" : "text-[#3B0E1A]/65 hover:bg-[#3B0E1A]/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {codesQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : codesQuery.isError ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#3B0E1A]/20 bg-[#FCF8F7] px-6 py-14 text-center">
                <CircleAlert size={26} className="text-[#8A5A5E]" />
                <p className="mt-3 text-sm font-semibold text-[#1A060B]">No pudimos cargar los cupones</p>
                <Button variant="outline" size="sm" onClick={() => codesQuery.refetch()} className="mt-4">Reintentar</Button>
              </div>
            ) : visibleCodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#3B0E1A]/20 bg-[#FCF8F7] px-6 py-14 text-center">
                <Tag size={30} className="text-[#8A5A5E]/55" />
                <p className="mt-3 text-sm font-semibold text-[#1A060B]">
                  {codes.length === 0 ? "Todavía no hay cupones" : "No hay resultados con estos filtros"}
                </p>
                <p className="mt-1 text-xs text-[#320C16]/60">
                  {codes.length === 0 ? "Crea el primero cuando tengas una promoción lista." : "Prueba otro término o vuelve a ver todos."}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border border-[#3B0E1A]/12 bg-white md:block">
                  <Table>
                    <TableHeader className="bg-[#FCF8F7]">
                      <TableRow className="hover:bg-[#FCF8F7]">
                        <TableHead>Código y descuento</TableHead>
                        <TableHead>Alcance</TableHead>
                        <TableHead>Disponibilidad</TableHead>
                        <TableHead>Vigencia</TableHead>
                        <TableHead className="w-[190px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCodes.map((coupon) => {
                        const status = couponStatus(coupon);
                        const scope = [coupon.planName || "Todos los planes", coupon.classCategory ? CATEGORY_LABEL[coupon.classCategory] || coupon.classCategory : null]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <TableRow key={coupon.id} className="border-[#3B0E1A]/8 hover:bg-[#FCF8F7]">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => copyCode(coupon.code)}
                                  className="group rounded-lg border border-[#3B0E1A]/10 bg-[#FCF8F7] px-2.5 py-1.5 font-mono text-sm font-bold tracking-wide text-[#1A060B] transition-colors hover:border-[#3B0E1A]/35"
                                  title="Copiar código"
                                >
                                  {coupon.code}<Copy size={11} className="ml-1.5 inline opacity-45 group-hover:opacity-100" />
                                </button>
                                <div>
                                  <p className="flex items-center gap-1 text-sm font-semibold text-[#1A060B]">
                                    <Percent size={13} className="text-[#8A5A5E]" /> {discountLabel(coupon)} de descuento
                                  </p>
                                  {Number(coupon.minOrderAmount) > 0 && <p className="mt-0.5 text-[11px] text-[#320C16]/55">Mínimo {money(coupon.minOrderAmount)}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="max-w-[190px] truncate text-xs font-medium text-[#320C16]">{scope}</p>
                              <p className="mt-1 text-[11px] text-[#320C16]/55">{CHANNEL_LABEL[coupon.channel || "all"] || coupon.channel}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                              <p className="mt-1.5 text-xs text-[#320C16]/65">
                                {coupon.maxUses === null
                                  ? `${Number(coupon.usesCount || 0)} uso${Number(coupon.usesCount || 0) === 1 ? "" : "s"} confirmado${Number(coupon.usesCount || 0) === 1 ? "" : "s"}`
                                  : `${status.remaining} disponible${status.remaining === 1 ? "" : "s"} de ${coupon.maxUses}`}
                              </p>
                              {status.pendingReservations > 0 && <p className="text-[10px] text-amber-700">{status.pendingReservations} apartado{status.pendingReservations === 1 ? "" : "s"} por pago pendiente</p>}
                            </TableCell>
                            <TableCell>
                              <p className="text-xs font-medium text-[#320C16]">{formatExpiry(coupon.expiresAt)}</p>
                              <p className="mt-1 text-[11px] text-[#320C16]/55">Creado {format(new Date(coupon.createdAt), "d MMM yyyy", { locale: es })}</p>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => setRedemptionsFor(coupon)} className="h-8 px-2 text-xs" title="Ver usos">
                                  <Eye size={13} className="mr-1" /> Usos
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => openEdit(coupon)} className="h-8 w-8" title="Editar cupón">
                                  <Edit3 size={14} />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setCouponToDelete(coupon)} className="h-8 w-8 text-red-700 hover:bg-red-50 hover:text-red-800" title="Eliminar cupón">
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2 md:hidden">
                  {visibleCodes.map((coupon) => {
                    const status = couponStatus(coupon);
                    return (
                      <article key={coupon.id} className="rounded-2xl border border-[#3B0E1A]/12 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <button type="button" onClick={() => copyCode(coupon.code)} className="font-mono text-base font-bold tracking-wide text-[#1A060B]">
                              {coupon.code}<Copy size={11} className="ml-1.5 inline" />
                            </button>
                            <p className="mt-1 text-sm font-semibold text-[#320C16]">{discountLabel(coupon)} de descuento</p>
                          </div>
                          <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                        </div>
                        <p className="mt-3 text-xs text-[#320C16]/70">{coupon.planName || "Todos los planes"} · {CHANNEL_LABEL[coupon.channel || "all"]}</p>
                        <div className="mt-3 flex items-center justify-between border-t border-[#3B0E1A]/8 pt-3">
                          <span className="text-[11px] text-[#320C16]/60">{coupon.maxUses === null ? "Usos ilimitados" : `${status.remaining} de ${coupon.maxUses} disponibles`}</span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => setRedemptionsFor(coupon)} className="h-8 text-xs"><Users size={13} className="mr-1" /> Usos</Button>
                            <Button size="icon" variant="ghost" onClick={() => openEdit(coupon)} className="h-8 w-8"><Edit3 size={14} /></Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </main>

        <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) { setEditing(null); setForm(emptyForm); }
        }}>
          <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto border-[#3B0E1A]/15 bg-[#FCF8F7]">
            <DialogHeader>
              <DialogTitle className="font-bebas text-2xl tracking-wide text-[#1A060B]">{editing ? "Editar cupón" : "Crear cupón"}</DialogTitle>
              <p className="text-sm text-[#320C16]/65">Define exactamente dónde aplica y cuánto tiempo estará disponible.</p>
            </DialogHeader>

            <div className="space-y-5 py-1">
              <div className="grid gap-3 sm:grid-cols-[1.25fr,0.75fr]">
                <div>
                  <Label htmlFor="coupon-code">Código</Label>
                  <Input id="coupon-code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className="mt-1.5 font-mono font-semibold uppercase" placeholder="BIENVENIDA10" />
                  <p className="mt-1 text-[11px] text-[#320C16]/55">Letras, números, guion y guion bajo.</p>
                </div>
                <div>
                  <Label htmlFor="coupon-value">Valor</Label>
                  <Input id="coupon-value" type="number" min="0.01" max={form.discountType === "percent" ? 100 : undefined} step="0.01" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} className="mt-1.5" />
                  <Select value={form.discountType} onValueChange={(value) => setForm({ ...form, discountType: value as DiscountType })}>
                    <SelectTrigger className="mt-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Monto fijo (MXN)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="coupon-uses">Límite de usos</Label>
                  <Input id="coupon-uses" type="number" min="1" step="1" value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: event.target.value })} className="mt-1.5" placeholder="Sin límite" />
                  <p className="mt-1 text-[11px] text-[#320C16]/55">Déjalo vacío para usos ilimitados.</p>
                </div>
                <div>
                  <Label htmlFor="coupon-expiry">Vigencia hasta</Label>
                  <Input id="coupon-expiry" type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className="mt-1.5" />
                  <p className="mt-1 text-[11px] text-[#320C16]/55">Incluye todo el día seleccionado.</p>
                </div>
              </div>

              <div className="rounded-xl border border-[#3B0E1A]/10 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A5A5E]">Dónde aplica</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Plan</Label>
                    <Select value={form.planId} onValueChange={(value) => setForm({ ...form, planId: value })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los planes</SelectItem>
                        {formHasUnavailablePlan && <SelectItem value={form.planId}>Plan no disponible</SelectItem>}
                        {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name} · {money(plan.price)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoría</Label>
                    <Select value={form.classCategory} onValueChange={(value) => setForm({ ...form, classCategory: value })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Canal</Label>
                    <Select value={form.channel} onValueChange={(value) => setForm({ ...form, channel: value })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CHANNEL_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="coupon-minimum">Compra mínima</Label>
                    <Input id="coupon-minimum" type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(event) => setForm({ ...form, minOrderAmount: event.target.value })} className="mt-1.5" placeholder="Sin mínimo" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[#3B0E1A]/12 bg-white px-4 py-3">
                <div>
                  <Label htmlFor="coupon-active" className="text-sm font-semibold">Cupón activo</Label>
                  <p className="mt-0.5 text-[11px] text-[#320C16]/55">Puedes pausarlo sin perder su historial.</p>
                </div>
                <Switch id="coupon-active" checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked })} />
              </div>
            </div>

            <DialogFooter className="border-t border-[#3B0E1A]/10 pt-4">
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
              <Button onClick={submitForm} disabled={isSaving} className="bg-[#3B0E1A] text-white hover:bg-[#260910]">
                {isSaving && <Loader2 size={14} className="mr-2 animate-spin" />}{editing ? "Guardar cambios" : "Crear cupón"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(redemptionsFor)} onOpenChange={(open) => { if (!open) setRedemptionsFor(null); }}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-[#3B0E1A]/15 bg-[#FCF8F7]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#1A060B]">
                <Users size={17} /> Usos de <span className="rounded bg-[#3B0E1A]/10 px-1.5 py-0.5 font-mono text-sm">{redemptionsFor?.code}</span>
              </DialogTitle>
              <p className="text-sm text-[#320C16]/65">Incluye compras aprobadas y órdenes que siguen en proceso.</p>
            </DialogHeader>
            <div className="divide-y divide-[#3B0E1A]/10 rounded-xl border border-[#3B0E1A]/12 bg-white">
              {redemptionsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-[#320C16]/60"><Loader2 size={16} className="mr-2 animate-spin" /> Cargando usos…</div>
              ) : redemptions.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-[#320C16]/60">Aún no hay compras asociadas a este cupón.</div>
              ) : redemptions.map((redemption) => {
                const status = STATUS_LABEL[redemption.status] || { label: redemption.status, tone: "border-slate-200 bg-slate-50 text-slate-600" };
                return (
                  <div key={redemption.orderId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1A060B]">{redemption.userName || redemption.userEmail}</p>
                      <p className="mt-0.5 truncate text-xs text-[#320C16]/60">{redemption.planName || "Compra"} · {PAYMENT_LABEL[redemption.paymentMethod] || redemption.paymentMethod} · {format(new Date(redemption.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right text-xs"><p className="font-semibold text-[#1A060B]">−{money(redemption.discountAmount)}</p><p className="text-[#320C16]/55">Total {money(redemption.totalAmount)}</p></div>
                      <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(couponToDelete)} onOpenChange={(open) => { if (!open) setCouponToDelete(null); }}>
          <AlertDialogContent className="border-[#3B0E1A]/15 bg-[#FCF8F7]">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar {couponToDelete?.code}?</AlertDialogTitle>
              <AlertDialogDescription>El historial de órdenes conservará sus montos, pero ya no podrás volver a usar este cupón.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Conservar cupón</AlertDialogCancel>
              <AlertDialogAction onClick={() => couponToDelete && deleteMutation.mutate(couponToDelete.id)} className="bg-red-700 text-white hover:bg-red-800">
                {deleteMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <X size={14} className="mr-2" />} Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminLayout>
    </AuthGuard>
  );
}
