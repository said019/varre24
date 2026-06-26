import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, User, CalendarDays, CheckCircle2 } from "lucide-react";

export interface ClassItem {
  id: string;
  time: string;       // 'HH:MM'
  type: string;
  instructor: string;
  spots: number;
  duration: string;   // '50 min'
  date?: Date;
  color?: string;
}

interface Props {
  classData: ClassItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export const BookingDialog = ({ classData, open, onOpenChange, onSuccess }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Política dinámica (settings cancellation_window)
  const { data: policyData } = useQuery({
    queryKey: ["public-cancellation-policy"],
    queryFn: async () => (await api.get("/public/settings/cancellation_window")).data,
    staleTime: 1000 * 60 * 5,
  });
  const policyRaw = policyData?.data ?? policyData ?? {};
  const minHours = Number(policyRaw.min_hours ?? 5);
  const freePerMembership = Number(
    policyRaw.free_cancellations_per_membership ?? policyRaw.free_cancellations_per_month ?? 2
  );

  if (!classData) return null;

  const handleBook = async () => {
    if (!user) {
      onOpenChange(false);
      navigate(`/auth/login?returnUrl=/`);
      return;
    }
    setLoading(true);
    try {
      await api.post("/bookings", { classId: classData.id });
      setDone(true);
      toast({ title: "✅ ¡Reserva confirmada!", description: `${classData.type} · ${classData.time}` });
      onSuccess?.();
      setTimeout(() => { setDone(false); onOpenChange(false); }, 2000);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Inténtalo de nuevo";
      // Si no tiene membresía / créditos, mandar a comprar paquete en vez de mostrar error
      const noCredits = /membres[ií]a|cr[eé]dito|sin\s+cr[eé]ditos|active/i.test(msg);
      if (noCredits) {
        toast({
          title: "Necesitas un paquete activo",
          description: "Te llevamos a la tienda para que compres uno y reserves tu clase.",
        });
        onOpenChange(false);
        navigate("/app/checkout");
      } else {
        toast({ title: "Error al reservar", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const accentColor = classData.color ?? "#9B5A66";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) { setDone(false); onOpenChange(v); } }}>
      <DialogContent className="max-w-sm">
        {/* Color bar */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: accentColor }} />

        <DialogHeader className="pt-3">
          <DialogTitle className="text-xl">{classData.type}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={52} className="text-green-500" />
            <p className="font-semibold text-lg">¡Reserva confirmada!</p>
            <p className="text-sm text-muted-foreground">Te esperamos en el estudio 🎉</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              {classData.date && (
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays size={15} className="text-muted-foreground shrink-0" />
                  <span className="capitalize">
                    {format(classData.date, "EEEE dd 'de' MMMM", { locale: es })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Clock size={15} className="text-muted-foreground shrink-0" />
                <span>{classData.time} · {classData.duration}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <User size={15} className="text-muted-foreground shrink-0" />
                <span>{classData.instructor}</span>
              </div>
              <div className="rounded-lg px-4 py-3 text-sm mt-2"
                style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}33` }}>
                <span style={{ color: accentColor }} className="font-semibold">
                  {classData.spots} lugar{classData.spots !== 1 ? "es" : ""} disponible{classData.spots !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-[11px] text-amber-800 leading-relaxed space-y-1.5">
              <p className="font-semibold">Política de cancelación</p>
              <p>Cancela con un mínimo de <strong>{minHours} horas</strong> de anticipación. Si lo haces más tarde, la clase se cuenta como tomada y <strong>no se devuelve el crédito</strong>.</p>
              {freePerMembership > 0 && (
                <p>En cada membresía tienes <strong>{freePerMembership} cancelaciones gratis</strong> que te devuelven el crédito. A partir de la {freePerMembership + 1}.ª, la clase se cuenta como tomada aunque canceles a tiempo.</p>
              )}
            </div>

            {!user && (
              <p className="text-xs text-muted-foreground text-center -mt-1">
                Necesitas iniciar sesión para reservar
              </p>
            )}
          </>
        )}

        {!done && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={handleBook}
              disabled={loading || classData.spots === 0}
              style={{ background: accentColor, color: "#fff", border: "none" }}
              className="hover:opacity-90"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin mr-2" />Reservando…</>
                : user ? "Confirmar reserva" : "Iniciar sesión para reservar"
              }
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;
