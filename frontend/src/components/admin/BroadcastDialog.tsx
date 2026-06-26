import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, MessageSquare, Send, Users } from "lucide-react";

type Audience =
  | "accepts_communications"
  | "with_active_membership"
  | "without_membership"
  | "all";

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: "accepts_communications", label: "Aceptan comunicación", hint: "Solo clientas que marcaron recibir promociones" },
  { value: "with_active_membership", label: "Con membresía activa", hint: "Solo clientas con paquete vigente" },
  { value: "without_membership",     label: "Sin membresía activa", hint: "Para reactivar / promoción" },
  { value: "all",                    label: "Todas las clientas",   hint: "Todas las cuentas con rol cliente" },
];

interface Template {
  id: string;
  label: string;
  subject: string;
  headline: string;
  body: string;
  ctaUrl?: string;
  ctaText?: string;
  whatsapp: string;
}

const TEMPLATES: Template[] = [
  {
    id: "weekly",
    label: "Recordatorio semanal",
    subject: "Tu semana en VARRE24",
    headline: "Hola, {name}",
    body: "Te recordamos abrir tu app y reservar las clases de la semana antes de que se llenen.\n\nNuestros horarios son:\n• Lun a Vie: 7:30, 8:30, 17:00, 18:00 y 19:30\n• Sábados: 8:00 y 9:15\n• Domingos: 9:00 y 10:00\n\nNos vemos en el estudio.",
    ctaUrl: "https://pilatesroom.com.mx/app/classes",
    ctaText: "Reservar clases",
    whatsapp: "Hola {name} ✨ Te recordamos reservar tus clases de la semana en la app: https://pilatesroom.com.mx/app/classes",
  },
  {
    id: "promo",
    label: "Promoción / Descuento",
    subject: "Una sorpresa para ti",
    headline: "Algo especial para ti, {name}",
    body: "Tenemos una promoción exclusiva pensada para ti.\n\nDetalles:\n• Vigencia: [agrega fechas]\n• Beneficio: [describe el descuento]\n• Aplica a: [paquetes / clases]\n\nVe a la app para aprovecharla.",
    ctaUrl: "https://pilatesroom.com.mx/app/checkout",
    ctaText: "Ver planes",
    whatsapp: "Hola {name} 💛 Tenemos una promoción especial. Pasa a la app para más detalles: https://pilatesroom.com.mx/app/checkout",
  },
  {
    id: "schedule_change",
    label: "Cambio de horario",
    subject: "Aviso: cambio de horario",
    headline: "Aviso importante, {name}",
    body: "Te avisamos que habrá un cambio en el horario del estudio.\n\nFecha del cambio: [agrega fecha]\nDetalle: [describe el cambio]\n\nLas reservas afectadas se reagendaron automáticamente. Cualquier duda, contáctanos por WhatsApp.",
    ctaUrl: "https://pilatesroom.com.mx/app/bookings",
    ctaText: "Revisar mis reservas",
    whatsapp: "Hola {name} ⚠️ Habrá un cambio de horario. Revisa tus reservas en la app: https://pilatesroom.com.mx/app/bookings",
  },
  {
    id: "welcome",
    label: "Bienvenida (nueva persona)",
    subject: "Te damos la bienvenida a VARRE24",
    headline: "Te damos la bienvenida, {name}",
    body: "Qué gusto tenerte aquí. Estamos felices de acompañarte en este camino — esto es para ti.\n\nPara que aproveches al máximo:\n• Llega 10 min antes a tu primera clase\n• Usa ropa cómoda y calcetas antideslizantes\n• Trae botella de agua\n\nNos vemos pronto en el estudio.",
    ctaUrl: "https://pilatesroom.com.mx/app/classes",
    ctaText: "Reservar mi primera clase",
    whatsapp: "Hola {name} 🌿 Te damos la bienvenida a VARRE24. Reserva tu primera clase desde la app: https://pilatesroom.com.mx/app/classes",
  },
  {
    id: "renewal",
    label: "Renovar membresía",
    subject: "Tu membresía está por vencer",
    headline: "Tu plan está por terminar, {name}",
    body: "Tu membresía actual está cerca de vencer. Renueva ahora para que no pierdas el ritmo.\n\nRecuerda que las socias fundadoras tienen tarifa preferencial 2026 y 2027.\n\nNos vemos pronto.",
    ctaUrl: "https://pilatesroom.com.mx/app/checkout",
    ctaText: "Renovar plan",
    whatsapp: "Hola {name} ⏳ Tu membresía está por vencer. Renueva en la app para no perder el ritmo: https://pilatesroom.com.mx/app/checkout",
  },
  {
    id: "blank",
    label: "En blanco (escribir desde cero)",
    subject: "",
    headline: "Hola, {name}",
    body: "",
    ctaUrl: "",
    ctaText: "",
    whatsapp: "",
  },
];

export function BroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"email" | "whatsapp">("email");
  const [audience, setAudience] = useState<Audience>("accepts_communications");
  const [templateId, setTemplateId] = useState<string>("weekly");
  const [subject, setSubject] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  // Seed fields when template changes
  useEffect(() => {
    const t = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    setSubject(t.subject);
    setHeadline(t.headline);
    setBody(t.body);
    setCtaUrl(t.ctaUrl ?? "");
    setCtaText(t.ctaText ?? "");
    setWaMessage(t.whatsapp);
  }, [templateId]);

  const { data: countData } = useQuery({
    queryKey: ["broadcast-audience", audience],
    queryFn: async () => (await api.get(`/admin/broadcast/audience-count?audience=${audience}`)).data,
    enabled: open,
  });
  const audienceCount = countData?.data?.count ?? 0;

  const emailMutation = useMutation({
    mutationFn: () => api.post("/admin/broadcast/email", { audience, subject, headline, body, ctaUrl, ctaText }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      toast({ title: `Emails enviados`, description: `${d?.sent ?? 0} ok · ${d?.failed ?? 0} fallaron · ${d?.total ?? 0} totales` });
      setConfirmStep(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error al enviar", description: err?.response?.data?.message ?? err.message, variant: "destructive" });
      setConfirmStep(false);
    },
  });

  const waMutation = useMutation({
    mutationFn: () => api.post("/admin/broadcast/whatsapp", { audience, message: waMessage }),
    onSuccess: (res: any) => {
      const d = res?.data?.data ?? res?.data;
      toast({ title: "WhatsApp enviados", description: `${d?.sent ?? 0} ok · ${d?.failed ?? 0} fallaron · ${d?.total ?? 0} totales` });
      setConfirmStep(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error al enviar", description: err?.response?.data?.message ?? err.message, variant: "destructive" });
      setConfirmStep(false);
    },
  });

  const isPending = emailMutation.isPending || waMutation.isPending;

  const handleSend = () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    if (tab === "email") emailMutation.mutate();
    else waMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) { setConfirmStep(false); onOpenChange(v); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar comunicado</DialogTitle>
          <DialogDescription>Envía un email o WhatsApp a tus clientas. Usa <code className="text-[#7C0116]">{"{name}"}</code> para personalizar con el nombre.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Audience */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Audiencia</Label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users size={12} />
              {AUDIENCES.find((a) => a.value === audience)?.hint} · <strong>{audienceCount}</strong> destinatari{audienceCount === 1 ? "a" : "as"}
            </p>
          </div>

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

          {/* Channel tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "whatsapp")}>
            <TabsList className="w-full">
              <TabsTrigger value="email" className="flex-1"><Mail size={13} className="mr-1.5" />Email</TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex-1"><MessageSquare size={13} className="mr-1.5" />WhatsApp</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Asunto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del email" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Encabezado (h1)</Label>
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Hola, {name}" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Cuerpo</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="Tu mensaje. Usa salto de línea doble para separar párrafos." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">URL del botón (opcional)</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Texto del botón</Label>
                  <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Reservar clase" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Mensaje</Label>
                <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={6} placeholder="Hola {name}, tenemos novedades..." />
                <p className="text-[11px] text-muted-foreground">{waMessage.length} caracteres · WhatsApp permite hasta ~4000.</p>
              </div>
              <div className="rounded-xl border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                Throttling activado: 1.2s entre envíos para no saturar Evolution. Para 100 destinatarias toma ~2 minutos.
              </div>
            </TabsContent>
          </Tabs>

          {confirmStep && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              Estás por enviar a <strong>{audienceCount}</strong> destinatari{audienceCount === 1 ? "a" : "as"}. Confirma para proceder.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setConfirmStep(false); onOpenChange(false); }} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || audienceCount === 0 || (tab === "email" ? !subject || !body : !waMessage.trim())}
            className="bg-[#7C0116] hover:bg-[#5C0110] text-[#FFE4E8]"
          >
            {isPending ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <Send size={14} className="mr-1.5" />}
            {confirmStep ? `Confirmar y enviar a ${audienceCount}` : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BroadcastDialog;
