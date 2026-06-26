import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, Gift, MessageCircle, Share2, Sparkles, CheckCircle2 } from "lucide-react";

interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  uses_count?: number | null;
}

interface ReferralDiscount {
  eligible?: boolean;
  percent?: number;
  remaining?: number;
  expires_at?: string | null;
  referred_name?: string;
}

const Referrals = () => {
  const { toast } = useToast();

  // Mi código de referido (auto-creado al primer fetch si aún no existe)
  const { data: codeData, isLoading: codeLoading } = useQuery({
    queryKey: ["my-referral-code"],
    queryFn: async () => (await api.get("/referrals/code")).data,
  });
  const myCode: ReferralCode | null = codeData?.data ?? codeData ?? null;

  // ¿Tengo crédito acumulado para mi próximo paquete?
  const { data: creditData, isLoading: creditLoading } = useQuery({
    queryKey: ["my-referral-discount"],
    queryFn: async () => (await api.get("/users/me/referral-discount")).data,
    staleTime: 1000 * 60 * 5,
  });
  const credit: ReferralDiscount = creditData?.data ?? creditData ?? {};

  const code = myCode?.code ?? "";
  const usesCount = Number(myCode?.uses_count ?? 0);

  // Forzamos el dominio canónico oilsandlove.com.mx en vez de window.location.origin:
  // si la admin entra al PWA por la URL interna de Railway, el link compartido se vería
  // feo y los clientes podrían no abrirlo. El registro está montado en ambos dominios.
  const SITE_URL = "https://oilsandlove.com.mx";
  const shareUrl = code
    ? `${SITE_URL}/auth/register?ref=${encodeURIComponent(code)}`
    : "";

  const shareMessage = code
    ? `¡Hola! Te invito a Pilates Room — usa mi código *${code}* al inscribirte y yo te recomiendo desde mi experiencia. 💪✨\n\n${shareUrl}`
    : "";

  const copy = async (text: string, label = "Código copiado") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  const openWhatsApp = () => {
    if (!shareMessage) return;
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, "_blank", "noopener");
  };

  const nativeShare = async () => {
    if (!navigator.share) {
      copy(shareMessage, "Mensaje copiado, pégalo donde quieras");
      return;
    }
    try {
      await navigator.share({
        title: "Pilates Room",
        text: shareMessage,
        url: shareUrl,
      });
    } catch { /* user canceled */ }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="space-y-5 max-w-2xl">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold text-[#2d2d2d] flex items-center gap-2">
              <Gift size={20} /> Invita y gana 10%
            </h1>
            <p className="text-sm text-[#715B50] mt-1">
              Comparte tu código con amigas. Cuando alguien lo use en su <strong>primera compra</strong>,
              tú recibes un <strong>10% de descuento</strong> para tu siguiente paquete.
            </p>
          </div>

          {/* Crédito acumulado */}
          {credit.eligible && (
            <div className="rounded-2xl border border-[#1a6b0a]/25 bg-gradient-to-r from-[#1a6b0a]/10 to-[#1a6b0a]/[0.04] p-4 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-[#1a6b0a] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-[#1a6b0a]">
                  ¡Tienes {credit.percent ?? 10}% de descuento listo!
                </p>
                <p className="text-xs text-[#1a6b0a]/80 mt-0.5">
                  Aplica automáticamente en tu próxima compra de membresía.
                  {credit.referred_name && <> Gracias por referir a {credit.referred_name.split(" ")[0]}.</>}
                </p>
              </div>
            </div>
          )}

          {/* Tarjeta con el código */}
          <div className="rounded-2xl border border-[#836A5D]/20 bg-gradient-to-br from-[#836A5D]/[0.06] via-[#C8B79E]/[0.04] to-transparent p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#836A5D]/70 font-semibold mb-2">Tu código</p>
            {codeLoading ? (
              <Skeleton className="h-12 w-48" />
            ) : (
              <button
                onClick={() => copy(code)}
                className="group flex items-center gap-3"
                title="Toca para copiar"
              >
                <span className="font-bebas text-[2.8rem] leading-none tracking-wide text-[#2d2d2d] group-hover:text-[#836A5D] transition-colors">
                  {code}
                </span>
                <Copy size={18} className="text-[#836A5D]/40 group-hover:text-[#836A5D]" />
              </button>
            )}
            {codeLoading ? (
              <Skeleton className="h-3 w-44 mt-2" />
            ) : (
              <p className="text-[11px] text-[#836A5D]/60 mt-2">
                Toca el código para copiarlo · {usesCount} {usesCount === 1 ? "persona ya lo usó" : "personas ya lo usaron"}
              </p>
            )}

            {/* Botones de compartir */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                onClick={openWhatsApp}
                className="bg-[#25D366] hover:bg-[#1ebe57] text-white"
                disabled={!code}
              >
                <MessageCircle size={16} className="mr-2" /> WhatsApp
              </Button>
              <Button
                onClick={() => copy(shareMessage, "Mensaje copiado")}
                variant="outline"
                disabled={!code}
              >
                <Copy size={16} className="mr-2" /> Copiar mensaje
              </Button>
              <Button
                onClick={nativeShare}
                variant="outline"
                disabled={!code}
              >
                <Share2 size={16} className="mr-2" /> Compartir
              </Button>
            </div>
          </div>

          {/* Cómo funciona */}
          <div className="rounded-2xl border border-[#836A5D]/15 bg-white/50 p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#2d2d2d] flex items-center gap-2">
              <Sparkles size={14} className="text-[#836A5D]" /> Cómo funciona
            </h2>
            <ol className="space-y-2.5 text-sm text-[#715B50]">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#836A5D] text-white text-[0.65rem] font-semibold flex items-center justify-center mt-0.5">1</span>
                <span>Comparte tu código <strong className="text-[#2d2d2d] font-mono">{code || "—"}</strong> con personas que aún no son parte de Pilates Room.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#836A5D] text-white text-[0.65rem] font-semibold flex items-center justify-center mt-0.5">2</span>
                <span>Lo escriben en el checkout (campo <em>"¿Tienes un código?"</em>) antes de su <strong>primera compra</strong>.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#836A5D] text-white text-[0.65rem] font-semibold flex items-center justify-center mt-0.5">3</span>
                <span>Cuando su pago se aprueba, automáticamente recibes <strong>10% de descuento</strong> para tu próximo paquete.</span>
              </li>
            </ol>
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mt-3">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                <strong>Reglas:</strong> tu código solo aplica a personas <strong>nuevas</strong> (cuya primera membresía aún no se ha aprobado).
                Una persona solo puede canjear UN código de referido en su vida en el estudio. Las clases muestra no cuentan.
              </p>
            </div>
          </div>
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Referrals;
