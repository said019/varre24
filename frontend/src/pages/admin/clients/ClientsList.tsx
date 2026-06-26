import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Search, UserPlus, CreditCard, Building2, Heart } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

// ── Schemas ────────────────────────────────────────────────────────────────────
const editSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  displayName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  acceptsCommunications: z.boolean().default(true),
});

const manualSchema = z.object({
  displayName: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  planId: z.string().optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
  startDate: z.string().optional(),
  notes: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;
type ManualFormData = z.infer<typeof manualSchema>;

interface Client extends EditFormData {
  id: string;
  role: string;
}

interface Plan { id: string; name: string; price: number; category: string; classLimit?: number; class_limit?: number; }

const COMPLEMENTS = [
  { id: "nutricion-hormonal", name: "Nutrición — Salud Hormonal", specialist: "LN. Clara Pérez" },
  { id: "nutricion-rendimiento", name: "Nutrición — Rendimiento Físico", specialist: "LN. Majo Zamorano" },
  { id: "descarga-muscular", name: "Descarga Muscular", specialist: "LTF. Angelina Huante" },
];
const COMBO_PRICES: Record<number, { price: number; discount: number }> = {
  8: { price: 1030, discount: 990 }, 12: { price: 1250, discount: 1190 }, 16: { price: 1450, discount: 1340 },
};

// ── Payment method selector ────────────────────────────────────────────────────
// VARRE24 solo cobra con tarjeta (terminal en estudio) o transferencia.
// El valor "cash" se conserva como código backend para "Tarjeta" por compat.
const PAYMENT_METHODS = [
  { value: "cash",     label: "Tarjeta",       Icon: CreditCard },
  { value: "transfer", label: "Transferencia", Icon: Building2 },
] as const;

// ── Main component ─────────────────────────────────────────────────────────────
const ClientsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing]   = useState<Client | null>(null);
  // Manual registration dialog
  const [manualOpen, setManualOpen] = useState(false);
  const [complementType, setComplementType] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Clients list
  const { data, isLoading } = useQuery<{ data: Client[] }>({
    queryKey: ["clients", debouncedSearch],
    queryFn: async () => (await api.get(`/users?role=client&search=${debouncedSearch}`)).data,
  });
  const clients = Array.isArray(data?.data) ? data.data : [];

  // Plans for the manual dialog
  const { data: plansData } = useQuery<{ data: Plan[] }>({
    queryKey: ["plans-active"],
    queryFn: async () => (await api.get("/plans?active=true")).data,
    staleTime: 60_000,
  });
  const plans: Plan[] = Array.isArray(plansData?.data) ? plansData.data : [];

  // ── Edit form ──────────────────────────────────────────────────────────────
  const editForm = useForm<EditFormData>({ resolver: zodResolver(editSchema) });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Client) => api.put(`/users/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente actualizado" });
      setEditOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente eliminado" });
    },
  });

  const openEdit = (c: Client) => { editForm.reset(c); setEditing(c); setEditOpen(true); };
  const onEditSubmit = (d: EditFormData) => {
    if (editing) updateMutation.mutate({ ...d, id: editing.id, role: "client" });
  };

  // ── Manual registration form ───────────────────────────────────────────────
  const manualForm = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { startDate: format(new Date(), "yyyy-MM-dd") },
  });
  const selectedPlanId = manualForm.watch("planId");
  const selectedPlan   = plans.find((p) => p.id === selectedPlanId);
  const paymentMethod  = manualForm.watch("paymentMethod");

  const manualMutation = useMutation({
    mutationFn: (d: ManualFormData) => api.post("/admin/clients/manual", { ...d, complementType: complementType ?? undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      const msg = res.data?.data?.membershipId
        ? "Clienta registrada y membresía activada ✓"
        : "Clienta registrada ✓";
      toast({ title: msg });
      setManualOpen(false);
      setComplementType(null);
      manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (err: any) => {
      toast({
        title: "Error al registrar",
        description: err?.response?.data?.error ?? "Revisa los datos e intenta de nuevo",
        variant: "destructive",
      });
    },
  });

  const onManualSubmit = (d: ManualFormData) => manualMutation.mutate(d);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
            <div>
              <h1 className="text-3xl font-bold text-[#2B0911] mb-1">Clientas</h1>
              <p className="text-sm text-[#2B0911]/35">{clients.length} clientas registradas</p>
            </div>
            <button
              onClick={() => setManualOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#7C0116] to-[#E7C9CF] hover:opacity-90 transition-opacity"
            >
              <UserPlus size={15} /> Nueva clienta
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-5 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2B0911]/30" />
            <Input
              className="pl-8 bg-[#7C0116]/[0.05] border-[#7C0116]/15 text-[#2B0911] placeholder:text-[#7C0116]/40 focus:border-[#7C0116]/40"
              placeholder="Buscar clienta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-[#7C0116]/15 overflow-hidden bg-[#7C0116]/[0.03]">
            <Table>
              <TableHeader>
                <TableRow className="border-[#7C0116]/15 hover:bg-transparent">
                  <TableHead className="text-[#2B0911]/40 font-semibold text-xs uppercase tracking-wider">Nombre</TableHead>
                  <TableHead className="text-[#2B0911]/40 font-semibold text-xs uppercase tracking-wider">Email</TableHead>
                  <TableHead className="text-[#2B0911]/40 font-semibold text-xs uppercase tracking-wider">Teléfono</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array(5).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-[#7C0116]/12">
                      {Array(4).fill(0).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-[#7C0116]/[0.06]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                  : clients.map((c) => (
                    <TableRow key={c.id} className="border-[#7C0116]/12 hover:bg-[#7C0116]/[0.05] transition-colors">
                      <TableCell className="font-semibold text-[#2B0911]/85">{c.displayName}</TableCell>
                      <TableCell className="text-sm text-[#2B0911]/45">{c.email}</TableCell>
                      <TableCell className="text-sm text-[#2B0911]/45">{c.phone ?? "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-[#2B0911]/30 hover:text-[#2B0911]/70 hover:bg-[#7C0116]/[0.06]">
                              <MoreHorizontal size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-[#F3CCD4] border-[#7C0116]/15">
                            <DropdownMenuItem
                              className="text-[#2B0911]/70 hover:text-[#2B0911] focus:text-[#2B0911] hover:bg-[#7C0116]/[0.06] focus:bg-[#7C0116]/[0.06]"
                              onClick={() => navigate(`/admin/clients/${c.id}`)}
                            >
                              Ver detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-[#2B0911]/70 hover:text-[#2B0911] focus:text-[#2B0911] hover:bg-[#7C0116]/[0.06] focus:bg-[#7C0116]/[0.06]"
                              onClick={() => openEdit(c)}
                            >
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-[#f87171] hover:text-[#f87171] focus:text-[#f87171] hover:bg-[#f87171]/5 focus:bg-[#f87171]/5"
                              onClick={() => { if (window.confirm("¿Eliminar este cliente?")) deleteMutation.mutate(c.id); }}
                            >
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Edit dialog ──────────────────────────────────────────────────── */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg bg-[#F3CCD4] border-[#7C0116]/15 text-[#2B0911]">
            <DialogHeader>
              <DialogTitle className="text-[#2B0911]">Editar clienta</DialogTitle>
            </DialogHeader>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[#2B0911]/60 text-xs">Nombre</Label>
                  <Input className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911]" {...editForm.register("displayName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[#2B0911]/60 text-xs">Email</Label>
                  <Input type="email" className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911]" {...editForm.register("email")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[#2B0911]/60 text-xs">Teléfono</Label>
                  <PhoneInput
                    value={editForm.watch("phone") ?? ""}
                    onChange={(v) => editForm.setValue("phone", v)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[#2B0911]/60 text-xs">Fecha de nacimiento</Label>
                  <DatePicker value={editForm.watch("dateOfBirth")} onChange={(v) => editForm.setValue("dateOfBirth", v)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[#2B0911]/60 text-xs">Notas de salud</Label>
                <Input className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911]" {...editForm.register("healthNotes")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[#2B0911]/60 text-xs">Contacto de emergencia</Label>
                  <Input className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911]" placeholder="Nombre" {...editForm.register("emergencyContactName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[#2B0911]/60 text-xs">Teléfono emergencia</Label>
                  <Input className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911]" {...editForm.register("emergencyContactPhone")} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="border-[#7C0116]/15 text-[#2B0911]/60 hover:bg-[#7C0116]/[0.06]" onClick={() => setEditOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-gradient-to-r from-[#7C0116] to-[#E7C9CF] text-white border-0"
                >
                  Actualizar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Manual registration dialog ───────────────────────────────────── */}
        <Dialog open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") }); }}>
          <DialogContent className="max-w-xl bg-[#F3CCD4] border-[#7C0116]/15 text-[#2B0911] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#2B0911] flex items-center gap-2">
                <UserPlus size={18} className="text-[#7C0116]" />
                Nueva clienta
              </DialogTitle>
              <p className="text-xs text-[#2B0911]/35 mt-0.5">Registro manual · Si se proporciona email, la clienta podrá iniciar sesión</p>
            </DialogHeader>

            <form onSubmit={manualForm.handleSubmit(onManualSubmit)} className="space-y-5 pt-1">
              {/* Personal info */}
              <div>
                <p className="text-[11px] text-[#7C0116]/70 font-semibold uppercase tracking-wider mb-3">Datos personales</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[#2B0911]/60 text-xs">Nombre completo *</Label>
                    <Input
                      className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911] placeholder:text-[#7C0116]/40"
                      placeholder="Ana García"
                      {...manualForm.register("displayName")}
                    />
                    {manualForm.formState.errors.displayName && (
                      <p className="text-[10px] text-[#f87171]">{manualForm.formState.errors.displayName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[#2B0911]/60 text-xs">Email <span className="text-[#7C0116]/40">(opcional)</span></Label>
                    <Input
                      type="email"
                      className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911] placeholder:text-[#7C0116]/40"
                      placeholder="ana@email.com"
                      {...manualForm.register("email")}
                    />
                    {manualForm.formState.errors.email && (
                      <p className="text-[10px] text-[#f87171]">{manualForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[#2B0911]/60 text-xs">Teléfono</Label>
                    <PhoneInput
                      value={manualForm.watch("phone") ?? ""}
                      onChange={(v) => manualForm.setValue("phone", v)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[#2B0911]/60 text-xs">Fecha de nacimiento</Label>
                    <DatePicker value={manualForm.watch("dateOfBirth")} onChange={(v) => manualForm.setValue("dateOfBirth", v)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[#2B0911]/60 text-xs">Notas de salud</Label>
                    <Input
                      className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911] placeholder:text-[#7C0116]/40"
                      placeholder="Lesiones, condiciones..."
                      {...manualForm.register("healthNotes")}
                    />
                  </div>
                </div>
              </div>

              {/* Plan (optional) */}
              <div>
                <p className="text-[11px] text-[#E7C9CF]/70 font-semibold uppercase tracking-wider mb-3">Membresía (opcional)</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-[#2B0911]/60 text-xs">Plan</Label>
                    <Select
                      value={selectedPlanId ?? "none"}
                      onValueChange={(v) => manualForm.setValue("planId", v === "none" ? undefined : v)}
                    >
                      <SelectTrigger className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911]">
                        <SelectValue placeholder="Sin plan (solo crear cuenta)" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#F3CCD4] border-[#7C0116]/15">
                        <SelectItem value="none" className="text-[#2B0911]/50">Sin plan</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-[#2B0911]">
                            {p.name}
                            {p.price > 0 && (
                              <span className="ml-2 text-[#2B0911]/40">${p.price.toLocaleString("es-MX")}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Show price of selected plan */}
                  {selectedPlan && (() => {
                    const cl = (selectedPlan as any).classLimit ?? (selectedPlan as any).class_limit ?? 0;
                    const combo = COMBO_PRICES[cl];
                    const hasCombo = complementType && combo;
                    const basePrice = parseFloat(String(selectedPlan.price ?? 0));
                    const normalPrice = hasCombo ? combo.price : basePrice;
                    // VARRE24: descuento aplica a tarjeta (cash) o transferencia.
                    const isDiscount = paymentMethod === "cash" || paymentMethod === "transfer";
                    let discountPrice: number | null = null;
                    if (hasCombo && isDiscount) {
                      discountPrice = combo.discount;
                    } else if (!hasCombo && isDiscount) {
                      const features = (selectedPlan as any).features ?? [];
                      const discFeat = features.find((f: string) => f.includes("descuento"));
                      if (discFeat) {
                        const m = discFeat.match(/\$[\d,]+/);
                        if (m) discountPrice = parseFloat(m[0].replace(/[$,]/g, ""));
                      }
                    }
                    const finalPrice = discountPrice ?? normalPrice;
                    return (
                      <div className="rounded-xl border border-[#7C0116]/20 bg-[#FFF1F3]/60 p-3 space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#2B0911]/60">
                            {selectedPlan.name}
                            {hasCombo && <span className="text-[#E7C9CF]"> + complemento</span>}
                          </span>
                          {discountPrice ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#7C0116] line-through">${normalPrice.toLocaleString("es-MX")}</span>
                              <span className="font-bold text-[#2B0911]">${discountPrice.toLocaleString("es-MX")}</span>
                            </div>
                          ) : (
                            <span className="font-bold text-[#2B0911]">${normalPrice.toLocaleString("es-MX")}</span>
                          )}
                        </div>
                        {isDiscount && discountPrice && (
                          <p className="text-[10px] text-[#E7C9CF] font-medium">Precio con descuento (tarjeta/transferencia)</p>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-[#7C0116]/10">
                          <span className="text-sm font-semibold text-[#2B0911]">Total a cobrar</span>
                          <span className="text-lg font-bold text-[#2B0911]">${finalPrice.toLocaleString("es-MX")} MXN</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Complement add-on — for 8/12/16 class plans */}
                  {selectedPlan && COMBO_PRICES[(selectedPlan as any).classLimit ?? (selectedPlan as any).class_limit ?? 0] && (
                    <div className="space-y-2 rounded-xl border border-[#E7C9CF]/15 bg-[#E7C9CF]/[0.03] p-3">
                      <div className="flex items-center gap-1.5">
                        <Heart size={12} className="text-[#E7C9CF]" />
                        <Label className="text-[#2B0911]/60 text-xs">Agregar complemento (opcional)</Label>
                      </div>
                      <Select value={complementType ?? "none"} onValueChange={(v) => setComplementType(v === "none" ? null : v)}>
                        <SelectTrigger className="bg-white border-[#7C0116]/15 text-[#2B0911]">
                          <SelectValue placeholder="Sin complemento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-[#2B0911]/50">Sin complemento</SelectItem>
                          {COMPLEMENTS.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-[#2B0911]">
                              {c.name} — {c.specialist}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Payment method — only if plan selected */}
                  {selectedPlanId && selectedPlanId !== "none" && (
                    <div className="space-y-1">
                      <Label className="text-[#2B0911]/60 text-xs">Método de pago</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {PAYMENT_METHODS.map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => manualForm.setValue("paymentMethod", value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all",
                              paymentMethod === value
                                ? "border-[#7C0116]/50 bg-[#7C0116]/10 text-[#7C0116]"
                                : "border-[#7C0116]/15 bg-[#7C0116]/[0.04] text-[#2B0911]/40 hover:border-[#7C0116]/25 hover:text-[#2B0911]/60"
                            )}
                          >
                            <Icon size={16} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Start date — only if plan selected */}
                  {selectedPlanId && selectedPlanId !== "none" && (
                    <div className="space-y-1">
                      <Label className="text-[#2B0911]/60 text-xs">Fecha de inicio</Label>
                      <DatePicker value={manualForm.watch("startDate")} onChange={(v) => manualForm.setValue("startDate", v)} />
                    </div>
                  )}
                </div>
              </div>

              {/* Internal notes */}
              <div className="space-y-1">
                <Label className="text-[#2B0911]/60 text-xs">Notas internas</Label>
                <Input
                  className="bg-[#7C0116]/[0.06] border-[#7C0116]/15 text-[#2B0911] placeholder:text-[#7C0116]/40"
                  placeholder="Referida por, observaciones..."
                  {...manualForm.register("notes")}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#7C0116]/15 text-[#2B0911]/60 hover:bg-[#7C0116]/[0.06]"
                  onClick={() => setManualOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={manualMutation.isPending}
                  className="bg-gradient-to-r from-[#7C0116] to-[#E7C9CF] text-white border-0 min-w-[140px]"
                >
                  {manualMutation.isPending ? "Registrando…" : selectedPlanId && selectedPlanId !== "none" ? "Registrar + activar plan" : "Registrar clienta"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientsList;
