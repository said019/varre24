import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Tag, Plus, Edit2, Trash2, Copy, Percent, DollarSign, Users, Loader2 } from "lucide-react";

interface DiscountCode {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  minOrderAmount: number;
  planId: string | null;
  planName: string | null;
  classCategory: string | null;
  channel: string | null;
  isActive: boolean;
  createdAt: string;
}

interface FormState {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  maxUses: string;
  expiresAt: string;
  minOrderAmount: string;
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
  channel: "all",
  isActive: true,
};

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

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  approved:             { label: "Aprobada",    tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  pending_payment:      { label: "Esperando pago", tone: "text-amber-700 bg-amber-50 border-amber-200" },
  pending_verification: { label: "Por verificar",  tone: "text-amber-700 bg-amber-50 border-amber-200" },
  rejected:             { label: "Rechazada",   tone: "text-red-700 bg-red-50 border-red-200" },
  cancelled:            { label: "Cancelada",   tone: "text-gray-600 bg-gray-50 border-gray-200" },
  expired:              { label: "Expirada",    tone: "text-gray-600 bg-gray-50 border-gray-200" },
};

const PAYMENT_LABEL: Record<string, string> = {
  card: "Tarjeta",
  transfer: "Transferencia",
  cash: "Efectivo",
};

export default function DiscountCodesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [redemptionsFor, setRedemptionsFor] = useState<DiscountCode | null>(null);

  const redemptionsQuery = useQuery({
    queryKey: ["admin-discount-redemptions", redemptionsFor?.id],
    queryFn: async () =>
      (await api.get(`/discount-codes/${redemptionsFor!.id}/redemptions`)).data,
    enabled: !!redemptionsFor,
    staleTime: 0,
  });
  const redemptions: Redemption[] = Array.isArray(redemptionsQuery.data?.data) ? redemptionsQuery.data.data : [];

  const { data, isLoading } = useQuery({
    queryKey: ["admin-discount-codes"],
    queryFn: async () => (await api.get("/discount-codes")).data,
  });
  const codes: DiscountCode[] = Array.isArray(data?.data) ? data.data : [];

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post("/discount-codes", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-discount-codes"] });
      toast({ title: "Cupón creado" });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: err?.response?.data?.message || "Error al crear cupón", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) => api.put(`/discount-codes/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-discount-codes"] });
      toast({ title: "Cupón actualizado" });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: err?.response?.data?.message || "Error al actualizar", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/discount-codes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-discount-codes"] });
      toast({ title: "Cupón eliminado" });
    },
    onError: (err: any) => {
      toast({ title: err?.response?.data?.message || "Error al eliminar", variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: DiscountCode) => {
    setEditing(c);
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      maxUses: c.maxUses ? String(c.maxUses) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      minOrderAmount: c.minOrderAmount ? String(c.minOrderAmount) : "",
      channel: c.channel || "all",
      isActive: c.isActive,
    });
    setOpen(true);
  };

  const handleSubmit = () => {
    const code = form.code.trim().toUpperCase();
    const discountValue = Number(form.discountValue);
    if (!code || !Number.isFinite(discountValue) || discountValue <= 0) {
      toast({ title: "Código y valor del descuento son requeridos", variant: "destructive" });
      return;
    }
    if (form.discountType === "percent" && discountValue > 100) {
      toast({ title: "Un porcentaje no puede ser mayor a 100", variant: "destructive" });
      return;
    }
    const payload = {
      code,
      discountType: form.discountType,
      discountValue,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
      channel: form.channel,
      isActive: form.isActive,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: `Copiado: ${code}` });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#2B0911] flex items-center gap-2">
                <Tag size={22} /> Cupones de descuento
              </h1>
              <p className="text-sm text-[#5C0110]">
                Crea cupones de % o monto fijo con cupos limitados, fecha de expiración y compra mínima.
              </p>
            </div>
            <Button onClick={openCreate} className="bg-[#7C0116] hover:bg-[#670626] text-white">
              <Plus size={14} className="mr-2" /> Nuevo cupón
            </Button>
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : codes.length === 0 ? (
            <div className="text-center py-16 text-[#7C0116]/60 text-sm">
              <Tag size={32} className="mx-auto mb-2 opacity-40" />
              No hay cupones creados todavía.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {codes.map((c) => {
                const usesLeft = c.maxUses ? Math.max(0, c.maxUses - (c.usesCount || 0)) : null;
                const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const exhausted = usesLeft === 0;
                const inactive = !c.isActive || isExpired || exhausted;
                return (
                  <div key={c.id} className={`rounded-xl border p-4 transition-shadow hover:shadow-sm ${inactive ? "border-gray-300/50 bg-gray-50/40 opacity-70" : "border-[#7C0116]/15 bg-white"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyCode(c.code)}
                            className="font-mono font-bold text-lg text-[#2B0911] hover:text-[#7C0116] transition-colors"
                            title="Copiar código"
                          >
                            {c.code}
                          </button>
                          <button
                            onClick={() => copyCode(c.code)}
                            className="text-[#7C0116]/40 hover:text-[#7C0116]"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                        <p className="text-sm font-semibold text-[#7C0116] mt-0.5 flex items-center gap-1">
                          {c.discountType === "percent" ? <Percent size={12} /> : <DollarSign size={12} />}
                          {c.discountType === "percent"
                            ? `${c.discountValue}% off`
                            : `$${Number(c.discountValue).toLocaleString("es-MX")} MXN off`}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isExpired ? (
                          <Badge variant="outline" className="border-gray-400/50 text-gray-500 bg-gray-50">Expirado</Badge>
                        ) : exhausted ? (
                          <Badge variant="outline" className="border-red-400/50 text-red-700 bg-red-50">Agotado</Badge>
                        ) : c.isActive ? (
                          <Badge variant="outline" className="border-green-500/50 text-green-700 bg-green-50">Activo</Badge>
                        ) : (
                          <Badge variant="outline" className="border-gray-400/50 text-gray-500 bg-gray-50">Inactivo</Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#5C0110]">
                      <span className="rounded-full bg-[#7C0116]/[0.06] px-2 py-0.5">
                        Usos: <strong>{c.usesCount || 0}</strong>{c.maxUses ? ` / ${c.maxUses}` : " · ilimitado"}
                      </span>
                      {c.expiresAt && (
                        <span className="rounded-full bg-[#7C0116]/[0.06] px-2 py-0.5">
                          Vence: <strong>{format(new Date(c.expiresAt), "d MMM yyyy", { locale: es })}</strong>
                        </span>
                      )}
                      {Number(c.minOrderAmount) > 0 && (
                        <span className="rounded-full bg-[#7C0116]/[0.06] px-2 py-0.5">
                          Mínimo: <strong>${Number(c.minOrderAmount).toLocaleString("es-MX")}</strong>
                        </span>
                      )}
                      {c.channel && c.channel !== "all" && (
                        <span className="rounded-full bg-[#7C0116]/[0.06] px-2 py-0.5">Canal: <strong>{c.channel}</strong></span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)} className="text-xs">
                        <Edit2 size={12} className="mr-1" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRedemptionsFor(c)}
                        disabled={(c.usesCount || 0) === 0}
                        title={(c.usesCount || 0) === 0 ? "Nadie ha usado este cupón aún" : "Ver quién lo ha usado"}
                        className="text-xs"
                      >
                        <Users size={12} className="mr-1" /> Ver usos ({c.usesCount || 0})
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar el cupón ${c.code}? Esta acción no se puede deshacer.`)) {
                            deleteMutation.mutate(c.id);
                          }
                        }}
                        className="text-xs text-red-700 hover:bg-red-50"
                      >
                        <Trash2 size={12} className="mr-1" /> Eliminar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal create/edit */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cupón" : "Nuevo cupón"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Código (ej. BIENVENIDA10)</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="font-mono uppercase"
                  disabled={!!editing}
                />
                {editing && <p className="text-[10px] text-[#7C0116]/60 mt-1">El código no se puede cambiar después de crearlo.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo de descuento</Label>
                  <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed">Monto fijo (MXN)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">
                    {form.discountType === "percent" ? "Porcentaje" : "Monto en MXN"}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.discountType === "percent" ? 100 : undefined}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cupos (vacío = ilimitado)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder="ej. 50"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expira el</Label>
                  <Input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Compra mínima (MXN, opcional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.minOrderAmount}
                  onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                  placeholder="ej. 1000"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#7C0116]/15 bg-[#7C0116]/[0.04] px-3 py-2">
                <Label className="text-xs">Activo</Label>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#7C0116] hover:bg-[#670626] text-white"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Guardando…" : (editing ? "Actualizar" : "Crear")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: quién ha usado este cupón */}
        <Dialog open={!!redemptionsFor} onOpenChange={(o) => { if (!o) setRedemptionsFor(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users size={16} /> Usos del cupón
                {redemptionsFor && (
                  <span className="font-mono text-sm bg-[#7C0116]/10 text-[#7C0116] px-2 py-0.5 rounded">
                    {redemptionsFor.code}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {redemptionsQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-[#7C0116]/70 text-sm">
                  <Loader2 size={16} className="animate-spin mr-2" /> Cargando…
                </div>
              ) : redemptions.length === 0 ? (
                <p className="text-center py-10 text-sm text-[#5C0110] italic">
                  Nadie ha usado este cupón todavía.
                </p>
              ) : (
                <>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#7C0116]/60 font-semibold px-1">
                    {redemptions.length} {redemptions.length === 1 ? "uso" : "usos"} · más recientes primero
                  </p>
                  <ul className="divide-y divide-[#7C0116]/10 rounded-xl border border-[#7C0116]/15 bg-white">
                    {redemptions.map((r) => {
                      const st = STATUS_LABEL[r.status] || { label: r.status, tone: "text-gray-600 bg-gray-50 border-gray-200" };
                      const when = format(new Date(r.createdAt), "d MMM yyyy, HH:mm", { locale: es });
                      return (
                        <li key={r.orderId} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#2B0911] truncate">{r.userName}</p>
                            <p className="text-[11px] text-[#7C0116]/70 truncate">
                              {r.userEmail} · {r.planName ?? "—"} · <span className="font-mono">{r.orderNumber}</span>
                            </p>
                            <p className="text-[11px] text-[#7C0116]/55">
                              {when} · {PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0 tabular-nums">
                            <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full border font-semibold ${st.tone}`}>
                              {st.label}
                            </span>
                            <p className="text-sm font-bold text-[#2B0911]">${r.totalAmount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            <p className="text-[10px] text-emerald-700 font-semibold">−${r.discountAmount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} descuento</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRedemptionsFor(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
}
