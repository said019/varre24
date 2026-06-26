import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Users, User, ArrowLeft, UserPlus } from "lucide-react";

// "Clase de prueba" / "Clase muestra" no permite invitada.
function isTrialMembership(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  const planName = String(m.planName ?? m.plan_name ?? "").toLowerCase();
  const classLimit = Number(m.classLimit ?? m.class_limit ?? m.classesTotal ?? 0);
  return planName.includes("prueba") || planName.includes("muestra") || classLimit === 1;
}

const BookClassConfirm = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [bringGuest, setBringGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const { data: classData, isLoading } = useQuery({
    queryKey: ["class-detail", classId],
    queryFn: async () => (await api.get(`/classes/${classId}`)).data,
  });

  const { data: membershipData, isLoading: loadingMembership } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
    staleTime: 60_000,
  });

  const cls = classData?.data ?? classData ?? null;
  const rawMem = membershipData?.data !== undefined ? membershipData.data : membershipData;
  const membership = rawMem && typeof rawMem === "object" && "id" in rawMem ? rawMem : null;
  const isTrial = !!membership && isTrialMembership(membership);
  const creditsLeft = membership ? (
    membership.classesRemaining ?? membership.classes_remaining ?? null
  ) : null;
  const isUnlimited = creditsLeft === null && membership?.status === "active";
  const creditsNeeded = bringGuest ? 2 : 1;
  const notEnoughCredits = !isUnlimited && creditsLeft != null && Number(creditsLeft) < creditsNeeded;

  const used = Number(cls?.current_bookings ?? 0);
  const cap = Number(cls?.max_capacity ?? 0);
  const spotsLeft = Math.max(0, cap - used);
  const notEnoughSpots = bringGuest && spotsLeft < 2;

  const bookMutation = useMutation({
    mutationFn: () =>
      api.post("/bookings", {
        classId,
        ...(bringGuest && guestName.trim() ? {
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim() || undefined,
        } : {}),
      }),
    onSuccess: (res) => {
      const data = res.data;
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      if (data?.booking?.status === "waitlist") {
        toast({ title: "En lista de espera", description: "Te avisaremos si se libera un lugar" });
      } else {
        toast({
          title: bringGuest ? "¡Reservadas las 2 lugares!" : "¡Reserva confirmada!",
          description: bringGuest ? `Tú + ${guestName.trim()}. Se cobraron 2 créditos.` : undefined,
        });
      }
      navigate("/app/bookings");
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo reservar",
        description: err.response?.data?.message ?? "Inténtalo de nuevo",
        variant: "destructive",
      });
    },
  });

  const disableBook =
    bookMutation.isPending ||
    (bringGuest && !guestName.trim()) ||
    notEnoughCredits ||
    notEnoughSpots;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-lg space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/classes")}>
            <ArrowLeft size={16} className="mr-2" />Volver al calendario
          </Button>
          <h1 className="text-xl font-bold">Confirmar reserva</h1>
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : cls ? (
            <Card>
              <CardHeader>
                <CardTitle>{cls.class_type_name}</CardTitle>
                <Badge variant="outline" className="w-fit">{cls.level ?? "Todos los niveles"}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={14} className="text-muted-foreground" />
                  {cls.start_time ? format(safeParse(cls.start_time), "EEEE d 'de' MMMM yyyy", { locale: es }) : "—"}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-muted-foreground" />
                  {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : "—"} – {cls.end_time ? format(safeParse(cls.end_time), "HH:mm") : "—"}
                </div>
                {cls.instructor_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-muted-foreground" />
                    {cls.instructor_name}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-muted-foreground" />
                  {used} / {cap} lugares
                </div>

                {/* ── Invitada ── */}
                {/* Gate en loading: hasta saber la membresía no sabemos si es
                    trial (sin invitada) o no. Sin esto, durante la carga
                    isTrial=false y se mostraba "Se cobrarán 2 créditos…" + el
                    toggle habilitado, parpadeando para alumnas de prueba. */}
                {loadingMembership ? (
                  <Skeleton className="h-16 w-full rounded-xl" />
                ) : (
                <div className="rounded-xl border border-[#5B4A3E]/20 bg-[#5B4A3E]/[0.04] p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2A211B] flex items-center gap-1.5">
                        <UserPlus size={14} className="text-[#5B4A3E]" /> Llevar invitada
                      </p>
                      <p className="text-[11px] text-[#4A3D32] leading-snug mt-0.5">
                        {isTrial
                          ? "La clase de prueba no permite llevar invitada."
                          : "Se cobrarán 2 créditos (uno tuyo, uno de la invitada) y se ocupan 2 lugares."}
                      </p>
                    </div>
                    <Switch
                      checked={bringGuest}
                      disabled={isTrial}
                      onCheckedChange={(v) => {
                        setBringGuest(v);
                        if (!v) { setGuestName(""); setGuestPhone(""); }
                      }}
                    />
                  </div>
                  {bringGuest && !isTrial && (
                    <div className="space-y-2">
                      <Input
                        placeholder="Nombre de tu invitada"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        maxLength={120}
                        autoFocus
                      />
                      <Input
                        placeholder="Teléfono (opcional)"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        maxLength={40}
                        type="tel"
                      />
                    </div>
                  )}
                </div>
                )}

                {/* ── Avisos ── */}
                {notEnoughCredits && (
                  <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    {bringGuest
                      ? `Necesitas 2 créditos para tu invitada y tú; te ${creditsLeft === 1 ? "queda 1" : `quedan ${creditsLeft ?? 0}`}.`
                      : "Ya no te quedan créditos en tu paquete."}
                  </p>
                )}
                {notEnoughSpots && (
                  <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Esta clase solo tiene {spotsLeft === 1 ? "1 lugar" : `${spotsLeft} lugares`}; no alcanza para 2.
                  </p>
                )}

                <Button
                  className="w-full mt-2"
                  onClick={() => bookMutation.mutate()}
                  disabled={disableBook}
                >
                  {bookMutation.isPending
                    ? "Reservando..."
                    : bringGuest
                      ? "Confirmar reserva (2 créditos)"
                      : "Confirmar reserva"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Clase no encontrada</p>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default BookClassConfirm;
