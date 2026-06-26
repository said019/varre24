import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Cake, Mail, MessageSquare, Loader2, Sparkles, Send } from "lucide-react";

interface Birthday {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  dateOfBirth: string;
  nextBirthday: string;
  daysUntil: number;
  currentAge: number;
}

const TEMPLATES = [
  {
    id: "warm",
    label: "Cálido",
    text: `¡Feliz cumpleaños, {name}! 🎂

En VARRE24 celebramos contigo este nuevo año de vida. Que esté lleno de movimiento, fuerza y momentos de calma.

Te tenemos un detalle: tu próxima clase corre por nuestra cuenta. Solo agéndala desde la app y di "es mi cumpleaños" al llegar.

Con cariño,
Tu equipo de VARRE24 ✨`,
  },
  {
    id: "promo",
    label: "Con descuento",
    text: `¡Feliz cumpleaños, {name}! 🌸

Hoy queremos consentirte. Durante toda esta semana tienes 20% de descuento en cualquier paquete.

Usa el código CUMPLE20 al hacer tu compra en la app.

Disfruta tu día, te esperamos en el estudio.`,
  },
  {
    id: "short",
    label: "Cortito",
    text: `¡Feliz cumple, {name}! 🎂 Te deseamos un día hermoso lleno de movimiento y buenas vibras. — VARRE24`,
  },
  {
    id: "blank",
    label: "En blanco",
    text: "",
  },
];

const dayLabel = (d: number) => {
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d <= 7) return `En ${d} días`;
  return `En ${d} días`;
};

export function BirthdaysWidget() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [active, setActive] = useState<Birthday | null>(null);
  const [templateId, setTemplateId] = useState("warm");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWa, setSendWa] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-birthdays"],
    queryFn: async () => (await api.get("/admin/birthdays?window=45")).data,
    refetchOnMount: true,
  });
  const list: Birthday[] = data?.data ?? data ?? [];

  useEffect(() => {
    const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    setMessage(tpl.text);
  }, [templateId]);

  const greetMutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/birthdays/${active?.id}/greet`, {
        message,
        sendEmail,
        sendWhatsapp: sendWa,
      }),
    onSuccess: (res: any) => {
      const r = res?.data?.data?.results ?? {};
      const emailOk = r.email?.ok;
      const waOk = r.whatsapp?.ok;
      const parts = [];
      if (sendEmail) parts.push(`Email: ${emailOk ? "✓" : "✗"}`);
      if (sendWa)    parts.push(`WhatsApp: ${waOk ? "✓" : "✗"}`);
      toast({
        title: `Felicitación enviada a ${active?.displayName?.split(" ")[0]}`,
        description: parts.join(" · "),
      });
      qc.invalidateQueries({ queryKey: ["admin-birthdays"] });
      setActive(null);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "No se pudo enviar",
        description: err?.response?.data?.message ?? err.message,
      });
    },
  });

  const today = list.filter((b) => b.daysUntil === 0);
  const upcoming = list.filter((b) => b.daysUntil > 0);

  return (
    <div className="rounded-[1.35rem] border border-[#7C0116]/15 bg-white/65 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_18px_50px_-38px_rgba(84,67,49,0.5)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#E7C9CF]/30 to-[#7C0116]/15 text-[#7C0116]">
            <Cake size={16} />
          </span>
          <div>
            <p className="text-sm font-bold text-[#2B0911] leading-tight">Cumpleaños</p>
            <p className="text-[11px] text-[#7C0116]/65 leading-tight">{list.length} próxim{list.length === 1 ? "o" : "os"} en 45 días</p>
          </div>
        </div>
        {today.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7C9CF]/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#670626]">
            <Sparkles size={10} />
            {today.length} hoy
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#7C0116]/25 px-4 py-8 text-center">
          <p className="text-sm text-[#670626]/55">Sin cumpleaños próximos</p>
          <p className="text-[11px] text-[#670626]/40 mt-1">Las clientas que registren su fecha de nacimiento aparecerán aquí.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#7C0116]/10">
          {[...today, ...upcoming].slice(0, 6).map((b) => {
            const initials = (b.displayName || "?").split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            const isToday = b.daysUntil === 0;
            return (
              <div key={b.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="relative shrink-0">
                  {b.photoUrl ? (
                    <img src={b.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C0116] to-[#E7C9CF] text-[#FFE4E8] text-xs font-semibold flex items-center justify-center">
                      {initials}
                    </div>
                  )}
                  {isToday && (
                    <span className="absolute -bottom-1 -right-1 text-base">🎂</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[#2B0911] truncate leading-tight">{b.displayName}</p>
                  <p className="text-[11px] text-[#7C0116]/70 leading-tight mt-0.5">
                    {format(parseISO(b.nextBirthday), "d 'de' MMMM", { locale: es })} · {dayLabel(b.daysUntil)} · cumple {b.currentAge + (b.daysUntil > 0 ? 1 : 0)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isToday ? "default" : "ghost"}
                  className={isToday
                    ? "bg-[#E7C9CF] hover:bg-[#E7C9CF] text-[#2B0911] font-semibold text-xs h-8"
                    : "text-[#7C0116] hover:text-[#670626] hover:bg-[#E7C9CF]/15 text-xs h-8"
                  }
                  onClick={() => { setActive(b); setTemplateId("warm"); }}
                >
                  <Send size={12} className="mr-1" />Felicitar
                </Button>
              </div>
            );
          })}
          {list.length > 6 && (
            <p className="pt-3 text-center text-[11px] text-[#7C0116]/55">+{list.length - 6} más</p>
          )}
        </div>
      )}

      {/* Felicitar dialog */}
      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cake size={16} className="text-[#E7C9CF]" />
              Felicitar a {active?.displayName?.split(" ")[0]}
            </DialogTitle>
            <DialogDescription>
              Cumple {active?.currentAge != null ? active.currentAge + (active.daysUntil > 0 ? 1 : 0) : "—"} años · {active && format(parseISO(active.nextBirthday), "EEEE d 'de' MMMM", { locale: es })}
              <span className="block text-[11px] mt-1 text-[#7C0116]/60">Usa <code className="text-[#7C0116]">{"{name}"}</code> para personalizar.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Plantilla</Label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Mensaje</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={9}
                placeholder="Escribe tu mensaje personalizado..."
                className="font-alilato"
              />
              <p className="text-[11px] text-muted-foreground">{message.length} caracteres</p>
            </div>

            {/* Channels */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Canales de envío</Label>
              <div className="rounded-xl border border-[#7C0116]/15 divide-y divide-[#7C0116]/10">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-[#7C0116]" />
                    <div>
                      <p className="text-sm font-medium text-[#2B0911]">Email</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">{active?.email || "Sin email"}</p>
                    </div>
                  </div>
                  <Switch checked={sendEmail} onCheckedChange={setSendEmail} disabled={!active?.email} />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="text-[#7C0116]" />
                    <div>
                      <p className="text-sm font-medium text-[#2B0911]">WhatsApp</p>
                      <p className="text-[11px] text-muted-foreground">{active?.phone || "Sin teléfono"}</p>
                    </div>
                  </div>
                  <Switch checked={sendWa} onCheckedChange={setSendWa} disabled={!active?.phone} />
                </div>
              </div>
              {!sendEmail && !sendWa && (
                <p className="text-[11px] text-destructive">Selecciona al menos un canal</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)} disabled={greetMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => greetMutation.mutate()}
              disabled={greetMutation.isPending || (!sendEmail && !sendWa) || message.trim().length < 2}
              className="bg-[#E7C9CF] hover:bg-[#E7C9CF] text-[#2B0911] font-semibold"
            >
              {greetMutation.isPending ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Send size={14} className="mr-1.5" />}
              Enviar felicitación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BirthdaysWidget;
