import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Save, X, Minus, Plus, MoreHorizontal, Loader2, KeyRound, Copy } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
};

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Plan</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Vence</TableHead>
            <TableHead>Clases</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {mems.map((m: any) => (
            <TableRow key={m.id}>
              <TableCell>{m.planName ?? m.planId}</TableCell>
              <TableCell>
                <Badge variant={m.status === "active" ? "default" : m.status === "cancelled" ? "destructive" : "secondary"}>
                  {m.status === "active" ? "Activa" : m.status === "expired" ? "Expirada" : m.status === "cancelled" ? "Cancelada" : m.status}
                </Badge>
              </TableCell>
              <TableCell>{m.endDate ? new Date(m.endDate).toLocaleDateString("es-MX") : "—"}</TableCell>
              <TableCell>
                {m.classesRemaining == null
                  ? "∞"
                  : m.classLimit != null
                    ? `${m.classesRemaining} de ${m.classLimit}`
                    : m.classesRemaining}
              </TableCell>
              <TableCell>
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const paymentsArr = Array.isArray(payments?.data) ? payments.data : [];
  const creditsArr = Array.isArray(credits?.data) ? credits.data : [];

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          {isLoading ? (
            <Skeleton className="h-10 w-60 mb-4" />
          ) : (
            <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold">{u?.displayName}</h1>
                <p className="text-muted-foreground text-sm">{u?.email} · {u?.phone}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
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
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-900">
                  {walkinList.length} compra(s) previa(s) como invitada con este teléfono
                </p>
                <p className="text-xs text-amber-800">
                  Total: ${walkinList.reduce((s, w) => s + parseFloat(w.totalAmount ?? w.total_amount ?? 0), 0).toFixed(2)}
                </p>
              </div>
              <Button size="sm" onClick={() => linkWalkinsMutation.mutate()} disabled={linkWalkinsMutation.isPending}>
                {linkWalkinsMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Vincular a esta cuenta
              </Button>
            </div>
          )}

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Perfil</TabsTrigger>
              <TabsTrigger value="memberships">Membresías</TabsTrigger>
              <TabsTrigger value="bookings">Reservas</TabsTrigger>
              <TabsTrigger value="payments">Pagos</TabsTrigger>
              <TabsTrigger value="creditos">Créditos</TabsTrigger>
            </TabsList>

            {/* ── Perfil ── */}
            <TabsContent value="profile" className="mt-4">
              {isLoading ? <Skeleton className="h-40 w-full" /> : editing ? (
                <div className="space-y-4 max-w-lg">
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
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                      <Save size={14} className="mr-1" /> Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                      <X size={14} className="mr-1" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">Nombre:</span> {u?.displayName ?? "—"}</div>
                    <div><span className="font-medium">Email:</span> {u?.email ?? "—"}</div>
                    <div><span className="font-medium">Teléfono:</span> {u?.phone ?? "—"}</div>
                    <div><span className="font-medium">Fecha de nacimiento:</span> {u?.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString("es-MX") : "—"}</div>
                    <div><span className="font-medium">Contacto de emergencia:</span> {u?.emergencyContactName ?? "—"} {u?.emergencyContactPhone ?? ""}</div>
                    <div className="col-span-2"><span className="font-medium">Notas de salud:</span> {u?.healthNotes ?? "—"}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={startEditing}>
                    <Pencil size={14} className="mr-1" /> Editar perfil
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Membresías ── */}
            <TabsContent value="memberships" className="mt-4">
              <MembershipsTab userId={id!} />
            </TabsContent>

            {/* ── Reservas ── */}
            <TabsContent value="bookings" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Clase</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(Array.isArray(bookings?.data) ? bookings.data : []).map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.className ?? b.classId}</TableCell>
                      <TableCell>{b.startTime ? new Date(b.startTime).toLocaleString("es-MX", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className={b.status === "cancelled" ? "border-red-200 bg-red-50 text-red-600" : undefined}>{b.status === "confirmed" ? "Confirmada" : b.status === "cancelled" ? "Cancelada" : b.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            {/* ── Pagos ── */}
            <TabsContent value="payments" className="mt-4">
              {paymentsArr.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sin pagos registrados</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Monto</TableHead><TableHead>Método</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {paymentsArr.map((p: any) => {
                      const date = p.createdAt || p.created_at;
                      const method = p.method || p.payment_method || "";
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.planName ?? p.plan_name ?? "—"}</TableCell>
                          <TableCell>${parseFloat(p.total_amount ?? p.totalAmount ?? p.amount ?? 0).toFixed(2)}</TableCell>
                          <TableCell>{methodLabel[method.toLowerCase()] ?? method}</TableCell>
                          <TableCell>
                            {(() => {
                              // Pagos = estado del PAGO, no de la membresía.
                              const s = String(p.status ?? "");
                              const paid = s === "approved" || s === "active" || s === "paid";
                              const label = paid ? "Pagado"
                                : s === "pending_payment" ? "Esperando pago"
                                : s === "pending_verification" ? "Por verificar"
                                : s === "rejected" ? "Rechazado"
                                : s === "cancelled" ? "Cancelado"
                                : s === "expired" ? "Pagado"
                                : s;
                              return <Badge variant={paid || s === "expired" ? "default" : "secondary"}>{label}</Badge>;
                            })()}
                          </TableCell>
                          <TableCell>{date ? new Date(date).toLocaleDateString("es-MX") : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="creditos" className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">
                Cada movimiento de créditos. Una reserva normal resta 1; reservar con
                invitada cuesta 2 (1 de ella + 1 de la invitada). La columna “Saldo” es
                lo que quedó después.
              </p>
              {(() => {
                const guestEvents = creditsArr.filter((m: any) => {
                  const r = String(m.reason ?? "");
                  return ["booking_created_with_guest", "admin_guest_added", "admin_booking_assigned_with_guest"].includes(r);
                }).length;
                return guestEvents > 0 ? (
                  <p className="text-xs mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#EADCDD] text-[#260910] px-3 py-1">
                    👤 Invitadas que ha llevado: <strong>{guestEvents}</strong> · {guestEvents} crédito(s) extra
                  </p>
                ) : null;
              })()}
              {creditsArr.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sin movimientos de crédito</p>
              ) : (
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
                            {isGuest ? <Badge variant="secondary" className="font-normal">{label}</Badge> : <span>{label}</span>}
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
