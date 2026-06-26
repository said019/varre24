import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Gift, TrendingUp, Clock, CheckCircle2, Search, Check, X, Users } from "lucide-react";

interface PendingCredit {
  id: string;
  discountPercent: number;
  createdAt: string;
  expiresAt: string;
  referrerId: string;
  referrerName: string | null;
  referrerEmail: string | null;
  referredName: string | null;
  referredEmail: string | null;
  totalReferred: number;
  totalConverted: number;
}

interface Referral {
  id: string;
  createdAt: string;
  rewarded: boolean;
  rewardedAt: string | null;
  discountPercent: number | null;
  rewardOrderId: string | null;
  code: string | null;
  referrerId: string | null;
  referrerName: string | null;
  referrerEmail: string | null;
  referredId: string | null;
  referredName: string | null;
  referredEmail: string | null;
  referredHasActiveMembership: boolean;
  creditId: string | null;
  creditExpiresAt: string | null;
  creditUsedAt: string | null;
  creditVoidedAt: string | null;
  creditStatus: "active" | "used" | "expired" | "voided" | "pending" | "rejected" | null;
}

interface Summary {
  total: number;
  pending: number;
  rewarded: number;
  conversion: number;
  top: { id: string; name: string; email: string; total: number; rewarded: number }[];
}

const ReferralsList = () => {
  const [filter, setFilter] = useState<"all" | "pending" | "rewarded">("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: list, isLoading: loadingList } = useQuery<{ data: Referral[] }>({
    queryKey: ["admin-referrals-list"],
    queryFn: async () => (await api.get("/admin/referrals/list")).data,
  });

  // Créditos de referido por aprobar (ya no se aplican en automático).
  const { data: pendingData, isLoading: loadingPending } = useQuery<{ data: PendingCredit[] }>({
    queryKey: ["admin-referral-credits-pending"],
    queryFn: async () => (await api.get("/admin/referral-credits/pending")).data,
  });
  const pending = pendingData?.data ?? [];

  const invalidateReferralQueries = () => {
    qc.invalidateQueries({ queryKey: ["admin-referral-credits-pending"] });
    qc.invalidateQueries({ queryKey: ["admin-referrals-list"] });
    qc.invalidateQueries({ queryKey: ["admin-referrals-summary"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/referral-credits/${id}/approve`),
    onSuccess: () => { invalidateReferralQueries(); toast({ title: "Descuento aprobado", description: "Se aplicará en su próxima compra." }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo aprobar", variant: "destructive" }),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/referral-credits/${id}/reject`, {}),
    onSuccess: () => { invalidateReferralQueries(); toast({ title: "Descuento rechazado" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo rechazar", variant: "destructive" }),
  });

  const { data: summaryData, isLoading: loadingSummary } = useQuery<{ data: Summary }>({
    queryKey: ["admin-referrals-summary"],
    queryFn: async () => (await api.get("/admin/referrals/summary")).data,
  });
  const summary = summaryData?.data;

  const referrals = list?.data ?? [];
  const filtered = referrals.filter((r) => {
    if (filter === "pending" && r.rewarded) return false;
    if (filter === "rewarded" && !r.rewarded) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.referrerName?.toLowerCase().includes(q) ||
        r.referredName?.toLowerCase().includes(q) ||
        r.referrerEmail?.toLowerCase().includes(q) ||
        r.referredEmail?.toLowerCase().includes(q) ||
        r.code?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const metric = (label: string, value: string | number, icon: React.ReactNode, accent: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <span className="rounded-lg p-1.5" style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        {loadingSummary ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className="text-2xl font-bold text-[#3A2F26] tabular-nums">{value ?? "—"}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <div className="mb-6">
            <h1 className="admin-title font-bold text-[#3A2F26]">Referidos</h1>
            <p className="mt-1 text-sm text-[#3A2F26]/55">
              Cuando una referida hace su primera compra, su referidora gana un crédito. <strong>Tú decides</strong> si lo apruebas: solo los aprobados se aplican en su próxima compra.
            </p>
          </div>

          {/* ── Créditos por aprobar ── */}
          {(loadingPending || pending.length > 0) && (
            <Card className="mb-6 border-amber-300/60 bg-amber-50/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-[#3A2F26]">
                  <Clock size={16} className="text-amber-600" />
                  Descuentos por aprobar
                  {pending.length > 0 && (
                    <span className="ml-1 rounded-full bg-amber-500 text-white text-[11px] font-bold px-2 py-0.5 tabular-nums">{pending.length}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPending ? (
                  <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
                ) : (
                  <div className="space-y-2.5">
                    {pending.map((p) => (
                      <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#3A2F26] leading-tight">{p.referrerName ?? "—"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.referrerEmail}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#3A2F26]/75">
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} className="text-[#5B4A3E]" />
                              Refirió a <strong className="text-[#3A2F26]">{p.totalReferred}</strong> · <strong className="text-emerald-700">{p.totalConverted}</strong> compraron
                            </span>
                            {p.referredName && (
                              <span>Última: <strong className="text-[#3A2F26]">{p.referredName}</strong></span>
                            )}
                            <span className="rounded-full bg-[#5B4A3E]/10 px-2 py-0.5 font-semibold text-[#5B4A3E]">−{Number(p.discountPercent)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(p.id)}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check size={14} className="mr-1" /> Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { if (window.confirm(`¿Rechazar el descuento de ${p.referrerName}? No se le aplicará.`)) rejectMutation.mutate(p.id); }}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            <X size={14} className="mr-1" /> Rechazar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {metric("Total referidos", summary?.total ?? 0, <Gift size={15} />, "#5B4A3E")}
            {metric("Pendientes", summary?.pending ?? 0, <Clock size={15} />, "#8A8077")}
            {metric("Canjeados", summary?.rewarded ?? 0, <CheckCircle2 size={15} />, "#3A2F26")}
            {metric("Conversión", `${summary?.conversion ?? 0}%`, <TrendingUp size={15} />, "#D5C4B8")}
          </div>

          {/* Top referidores */}
          {!!summary?.top?.length && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Top alumnas que más refieren</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-[#5B4A3E]/10">
                  {summary.top.map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-bebas text-lg text-[#5B4A3E] w-5 text-center tabular-nums">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-[#3A2F26] truncate">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{t.email}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <p className="text-sm font-semibold text-[#3A2F26]">{t.total} referida{t.total !== 1 ? "s" : ""}</p>
                        <p className="text-[11px] text-muted-foreground">{t.rewarded} canjearon</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">Todos ({referrals.length})</TabsTrigger>
                <TabsTrigger value="pending">Pendientes ({referrals.filter((r) => !r.rewarded).length})</TabsTrigger>
                <TabsTrigger value="rewarded">Canjeados ({referrals.filter((r) => r.rewarded).length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, email o código"
                className="pl-9 sm:w-72"
              />
            </div>
          </div>

          {/* Lista */}
          <Card>
            <CardContent className="p-0">
              {loadingList ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <Gift size={28} className="mx-auto text-[#D5C4B8]/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {search || filter !== "all"
                      ? "No hay resultados con esos filtros."
                      : "Sin referidos todavía. Cuando alguien comparta su código aparecerá aquí."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#5B4A3E]/15 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="text-left py-2.5 px-4 font-semibold">Referidor</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Código</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Referido</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Fecha</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Estado</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Crédito</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Membresía</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-b border-[#5B4A3E]/10 last:border-0 hover:bg-[#5B4A3E]/[0.03]">
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#3A2F26] leading-tight">{r.referrerName ?? "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{r.referrerEmail}</p>
                          </td>
                          <td className="py-3 px-4">
                            <code className="text-[11px] font-mono text-[#5B4A3E] bg-[#D5C4B8]/15 px-1.5 py-0.5 rounded">{r.code ?? "—"}</code>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#3A2F26] leading-tight">{r.referredName ?? "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{r.referredEmail}</p>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground tabular-nums">
                            {r.createdAt ? format(new Date(r.createdAt), "d MMM yyyy", { locale: es }) : "—"}
                          </td>
                          <td className="py-3 px-4">
                            {r.rewarded ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px]">
                                <CheckCircle2 size={10} className="mr-1" />
                                Generado{r.discountPercent ? ` ${r.discountPercent}%` : ""}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-400/50 text-amber-700 bg-amber-50 text-[10px]">
                                <Clock size={10} className="mr-1" />
                                Pendiente
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {r.creditStatus === "pending" ? (
                              <Badge variant="outline" className="border-amber-400/60 text-amber-700 bg-amber-50 text-[10px]">
                                Por aprobar
                              </Badge>
                            ) : r.creditStatus === "rejected" ? (
                              <Badge variant="outline" className="border-rose-300 text-rose-600 bg-rose-50 text-[10px]">
                                Rechazado
                              </Badge>
                            ) : r.creditStatus === "active" ? (
                              <Badge variant="outline" className="border-blue-400/50 text-blue-700 bg-blue-50 text-[10px]">
                                Aprobado
                                {r.creditExpiresAt
                                  ? ` · vence ${format(new Date(r.creditExpiresAt), "d MMM", { locale: es })}`
                                  : ""}
                              </Badge>
                            ) : r.creditStatus === "used" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[10px]">
                                Canjeado
                              </Badge>
                            ) : r.creditStatus === "expired" ? (
                              <Badge variant="outline" className="border-zinc-300 text-zinc-500 bg-zinc-50 text-[10px]">
                                Vencido
                              </Badge>
                            ) : r.creditStatus === "voided" ? (
                              <Badge variant="outline" className="border-rose-300 text-rose-600 bg-rose-50 text-[10px]">
                                Anulado
                              </Badge>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {r.referredHasActiveMembership ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Activa
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ReferralsList;
