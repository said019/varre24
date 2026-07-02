import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check, Loader2, CreditCard, Copy, Building2,
  Tag, ChevronRight, ArrowLeft, Upload, CheckCircle, Sparkles,
} from "lucide-react";
import imgPilates from "@/assets/pilates-tower_1850574.png";

type Step = "select" | "method" | "bank" | "cash" | "upload" | "done";
type PaymentMethod = "transfer" | "card";

// El estudio absorbe la comisión de MercadoPago. No se recarga nada al cliente
// al pagar con tarjeta. Cualquier referencia a "card fee" se mantiene en 0 por
// compatibilidad con backends antiguos.

function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "application/pdf") {
      resolve(file);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

// Complementos de bienestar: feature retirada (precios combo hardcodeados que
// no correspondían a la configuración del estudio). Ya no se ofrecen.

// Helper: get discount price from plan's discount_price field (DB-driven)
function getPlanDiscountPrice(plan: any): number | null {
  const dp = plan?.discountPrice ?? plan?.discount_price;
  if (dp == null || dp === "" || dp === 0) return null;
  return Number(dp);
}

function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "1", "yes", "si", "sí", "t"].includes(value.toLowerCase());
  return false;
}

// ── Plan card ─────────────────────────────────────────────────────────────────
const PlanCard = ({
  plan, selected, onSelect,
}: { plan: any; selected: boolean; onSelect: () => void }) => {
  const classLimit = plan.classLimit ?? plan.class_limit ?? null;
  const durationDays = Number(plan.durationDays ?? plan.duration_days ?? 0);
  const nonTransferable = flag(plan.isNonTransferable ?? plan.is_non_transferable);
  const nonRepeatable = flag(plan.isNonRepeatable ?? plan.is_non_repeatable);
  const features: string[] = (Array.isArray(plan.features) ? plan.features : [])
    .filter((f: string) => !f.toLowerCase().includes("descuento") && !f.toLowerCase().includes("costo con"));
  const planPrice = Number(plan.price ?? 0);
  const discountPrice = getPlanDiscountPrice(plan);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full text-left rounded-2xl border p-4 transition-all duration-200 overflow-hidden",
        selected
          ? "border-[#3B0E1A]/60 bg-[#FFE4EE]"
          : "border-[#E8D7D6] bg-[#FCF8F7] hover:border-[#3B0E1A]/30"
      )}
    >
      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#3B0E1A] flex items-center justify-center">
          <Check size={11} className="text-white" />
        </span>
      )}
      <div className="flex items-start gap-3 pr-7">
        <div className="h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 border-[#C9A5A8]/30 bg-[#C9A5A8]/10">
          <img src={imgPilates} alt="" className="h-7 w-7 object-contain" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1A060B]/85 leading-snug">{plan.name}</p>
          {plan.description && (
            <p className="text-[11px] text-[#1A060B]/45 mt-0.5 leading-snug">{plan.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-bold text-[#1A060B]">${planPrice.toLocaleString("es-MX")}</span>
        <span className="text-xs text-[#1A060B]/35">{plan.currency ?? "MXN"}</span>
      </div>
      {discountPrice && (
        <p className="text-[11px] text-[#1a6b0a] font-bold mt-0.5">
          Tarjeta/transferencia: ${discountPrice.toLocaleString("es-MX")}
        </p>
      )}
      {features.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {features.map((f, i) => (
            <li key={i} className="text-[10px] text-[#1A060B]/45 flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">•</span>
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {durationDays > 0 && (
          <span className="text-[10px] text-[#4a5638] bg-[#C9A5A8]/15 border border-[#C9A5A8]/25 rounded-full px-2 py-0.5">
            {durationDays} días
          </span>
        )}
        {Number(classLimit) > 0 && (
          <span className="text-[10px] text-[#260910] bg-[#3B0E1A]/12 border border-[#3B0E1A]/20 rounded-full px-2 py-0.5">
            {classLimit} clases
          </span>
        )}
        {nonTransferable && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">No transferible</span>
        )}
        {nonRepeatable && (
          <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">No repetible</span>
        )}
      </div>
    </button>
  );
};

// ── Step pill bar ──────────────────────────────────────────────────────────────
const STEPS: { id: Step; label: string }[] = [
  { id: "select", label: "Plan" },
  { id: "method", label: "Pago" },
  { id: "upload", label: "Comprobante" },
  { id: "done",   label: "Listo" },
];

const StepBar = ({ current }: { current: Step }) => {
  const order: Step[] = ["select", "method", "bank", "cash", "upload", "done"];
  const currentIdx = order.indexOf(current);

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const sIdx = order.indexOf(s.id === "method" ? "method" : s.id);
        const done = currentIdx > sIdx;
        const active = s.id === current || (current === "bank" && s.id === "method") || (current === "cash" && s.id === "method");
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && <div className={cn("h-px w-6 rounded", done ? "bg-[#3B0E1A]/60" : "bg-[#3B0E1A]/10")} />}
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
              active ? "border-[#3B0E1A]/40 bg-[#3B0E1A]/10 text-[#3B0E1A]"
                : done ? "border-[#4ade80]/30 bg-[#4ade80]/5 text-[#4ade80]"
                : "border-[#3B0E1A]/15 text-[#1A060B]/25"
            )}>
              {done ? <Check size={10} /> : <span>{i + 1}</span>}
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const Checkout = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("select");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [discountCode, setDiscountCode] = useState("");
  const [discountResult, setDiscountResult] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderUuid, setOrderUuid] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [loadingBankAgain, setLoadingBankAgain] = useState(false);
  const MAX_PROOFS = 3;
  const [files, setFiles] = useState<File[]>([]);

  // Volver del paso "comprobante" al paso "datos de transferencia". Si llegamos
  // vía ?orderId=xxx no tenemos bankDetails en memoria → los traemos de la orden.
  const showBankDetailsAgain = async () => {
    if (bankDetails) { setStep("bank"); return; }
    const oid = orderUuid ?? searchParams.get("orderId");
    if (!oid) { setStep("bank"); return; }
    setLoadingBankAgain(true);
    try {
      const res = await api.get(`/orders/${oid}`);
      const o = res.data?.data ?? res.data;
      const bi = o?.bank_info ?? o?.bankInfo ?? null;
      setBankDetails({
        ...(bi || {}),
        amount: o?.total_amount ?? o?.totalAmount,
        currency: o?.currency ?? "MXN",
      });
      setStep("bank");
    } catch {
      toast({
        title: "No pudimos cargar los datos",
        description: "Consulta los datos de transferencia desde \"Mis órdenes\".",
        variant: "destructive",
      });
    } finally {
      setLoadingBankAgain(false);
    }
  };

  function validateProofFile(f: File): string | null {
    const ok = ["image/jpeg","image/png","image/webp"];
    if (!ok.includes(f.type)) return "Solo imágenes (JPG, PNG, WEBP).";
    if (f.size > 10 * 1024 * 1024) return "Cada archivo debe pesar menos de 10 MB.";
    return null;
  }

  const onAddFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    for (const f of arr) {
      const err = validateProofFile(f);
      if (err) { toast({ title: err, variant: "destructive" }); return; }
    }
    setFiles((prev) => [...prev, ...arr].slice(0, MAX_PROOFS));
  };
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  // If arriving with ?orderId=xxx, jump straight to upload step
  useEffect(() => {
    const oid = searchParams.get("orderId");
    if (oid) {
      setOrderUuid(oid);
      setStep("upload");
    }
  }, []);

  const { data: plansData, isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
    // El admin edita paquetes/precios desde otra sesión: refrescar al volver
    // a la pestaña para que el cliente vea los cambios sin recargar a mano.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // ── Trial restriction: "Clase prueba / muestra" is only for first-time users.
  // We detect a returning customer by checking whether the user has any approved
  // order in their history. The /orders endpoint is already prefetched by the
  // Dashboard and served from TanStack cache on most visits, so this adds no
  // extra network round-trip in the happy path.
  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await api.get("/orders")).data,
    staleTime: 60_000,
  });
  const myOrders: any[] = Array.isArray(ordersData?.data) ? ordersData.data : Array.isArray(ordersData) ? ordersData : [];
  // A customer is considered "returning" if they have at least one approved order
  // (i.e. they have completed at least one prior purchase).
  const isReturningCustomer = myOrders.some(
    (o) => o.status === "approved"
  );

  const rawPlans: any[] = Array.isArray(plansData?.data) ? plansData.data : Array.isArray(plansData) ? plansData : [];
  const allPlans = rawPlans
    .filter((p) => (p.isActive ?? p.is_active) !== false)
    .filter((p) => !(p.name ?? "").toLowerCase().includes("paquete +"))
    .sort((a, b) => (a.sortOrder ?? a.sort_order ?? 99) - (b.sortOrder ?? b.sort_order ?? 99));

  const trialPlan = allPlans.find((p) => (p.name ?? "").toLowerCase().includes("muestra"));
  const plans = allPlans.filter((p) => p !== trialPlan);

  // If orders finish loading and the user turns out to be a returning customer
  // but had the trial pre-selected (e.g., URL param or cache resolved late),
  // clear that selection so they can't accidentally proceed.
  useEffect(() => {
    if (!loadingOrders && isReturningCustomer && selectedPlan?.id === trialPlan?.id) {
      setSelectedPlan(null);
    }
  }, [loadingOrders, isReturningCustomer, trialPlan?.id, selectedPlan?.id]);

  // Complementos de bienestar: feature retirada. El precio es el del plan real.
  // Compute price
  const basePrice = selectedPlan?.price ?? 0;

  // Apply discount when paying by bank transfer (precio con descuento del plan)
  const planBasePrice = Number(selectedPlan?.price ?? 0);
  const individualDiscount = getPlanDiscountPrice(selectedPlan);
  const cashTransferPrice = individualDiscount;
  const effectivePrice = paymentMethod === "transfer" && cashTransferPrice
    ? cashTransferPrice : basePrice;
  const subtotalAmount = discountResult ? effectivePrice - (discountResult.discount_amount ?? 0) : effectivePrice;
  // Sin comisión por pago con tarjeta. El cliente paga el mismo monto que en transferencia.
  const cardSurcharge = 0;
  const finalAmount = Math.round(subtotalAmount * 100) / 100;

  const validateCodeMutation = useMutation({
    mutationFn: async () => {
      const r = await api.post("/discount-codes/validate", { code: discountCode, planId: selectedPlan?.id });
      return r.data?.data ?? r.data;
    },
    onSuccess: (data) => {
      setDiscountResult(data);
      toast({ title: "Código de descuento aplicado" });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? "Código inválido";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.post("/orders", {
        planId: selectedPlan.id,
        discountCode: discountResult?.code,
        paymentMethod,
      }),
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderUuid(data.id);
      setOrderId(data.order_number ?? data.orderNumber ?? data.orderId ?? data.id);
      setBankDetails(data.bankDetails ?? data.bank_details);
      const checkoutUrl = data.mp_checkout_url ?? data.mpCheckoutUrl;
      if (paymentMethod === "card") {
        if (checkoutUrl) {
          window.location.href = checkoutUrl; // → página de pago de MercadoPago
          return;
        }
        // MercadoPago no respondió: la orden quedó pendiente, se reintenta desde "Mis órdenes".
        toast({
          title: "No pudimos iniciar el pago en línea",
          description: "Tu orden quedó guardada. Reintenta el pago desde \"Mis órdenes\".",
          variant: "destructive",
        });
        window.location.href = "/app/orders";
        return;
      }
      if (paymentMethod === "transfer") setStep("bank");
      else setStep("cash");
    },
    onError: (err: any) => {
      // 409: ya hay una orden pendiente de este plan. En vez de dejar al
      // cliente atascado, lo llevamos a "Mis órdenes" para que continúe
      // (reintentar pago con tarjeta o subir comprobante de la existente).
      if (err?.response?.status === 409) {
        toast({
          title: "Ya tienes una orden de este plan",
          description: "Te llevamos a tus órdenes para completar el pago o cancelarla.",
        });
        window.location.href = "/app/orders";
        return;
      }
      toast({ title: "Error al crear orden", description: err.response?.data?.message, variant: "destructive" });
    },
  });

  const uploadProofMutation = useMutation({
    mutationFn: async () => {
      if (!orderUuid) throw new Error("No se encontró la orden.");
      if (files.length === 0) throw new Error("Selecciona al menos un comprobante.");
      const fd = new FormData();
      for (const f of files) {
        const compressed = await compressImage(f);
        fd.append("files", compressed);
      }
      return api.post(`/orders/${orderUuid}/proof`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["my-memberships"] });
      toast({
        title: "¡Tu membresía ya está activa!",
        description: "Recibimos tu comprobante. Ya puedes reservar; la admin lo verificará en las próximas 24h.",
      });
      setStep("done");
    },
    onError: (err: any) =>
      toast({ title: "No se pudo subir", description: err?.message || err?.response?.data?.message, variant: "destructive" }),
  });

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-xl px-1 py-4 sm:py-8 space-y-6">
          <div>
            <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B]">Membresías</p>
            <h1 className="mt-2 font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#1A060B]">Comprar membresía</h1>
          </div>

          <StepBar current={step} />

          {/* ── Step 1: Select plan ── */}
          {step === "select" && (
            <div className="space-y-5">
              {loadingPlans ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Clase muestra — visible siempre, pero deshabilitada para
                      usuarias que ya tienen una compra aprobada (clientes
                      recurrentes). El backend también lo bloquea mediante
                      is_non_repeatable + repeat_key; aquí solo es espejo de UI. */}
                  {trialPlan && !loadingOrders && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-[#C9A5A8]/80">
                        Conoce nuestro estudio
                      </p>
                      {isReturningCustomer ? (
                        /* ── Returning customer: show locked card ── */
                        <div className="relative w-full text-left rounded-2xl border border-[#C9A5A8]/20 bg-[#C9A5A8]/[0.04] p-4 overflow-hidden opacity-60 cursor-not-allowed select-none">
                          <div className="flex items-start gap-3 pr-2">
                            <div className="h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 border-[#C9A5A8]/20 bg-[#C9A5A8]/8">
                              <img src={imgPilates} alt="" className="h-7 w-7 object-contain opacity-40" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#1A060B]/50 leading-snug">{trialPlan.name}</p>
                              <p className="text-[11px] text-[#1A060B]/30 mt-0.5 leading-snug">{trialPlan.description}</p>
                            </div>
                          </div>
                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-2xl font-bold text-[#1A060B]/40">${Number(trialPlan.price ?? 0).toLocaleString("es-MX")}</span>
                            <span className="text-xs text-[#1A060B]/25">{trialPlan.currency ?? "MXN"}</span>
                          </div>
                          {/* Locked notice */}
                          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.05] px-3 py-2">
                            <Sparkles size={12} className="shrink-0 text-[#3B0E1A]/50" />
                            <p className="text-[11px] text-[#3B0E1A]/70 leading-snug">
                              Solo para tu primera clase — ya eres parte de VARRE24.
                            </p>
                          </div>
                        </div>
                      ) : (
                        /* ── First-time user: selectable card ── */
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlan(trialPlan);
                            setDiscountResult(null);
                          }}
                          className={cn(
                            "relative w-full text-left rounded-2xl border p-4 transition-all duration-200 overflow-hidden",
                            selectedPlan?.id === trialPlan.id
                              ? "border-[#3B0E1A]/60 bg-[#FFE4EE]"
                              : "border-[#C9A5A8]/25 bg-[#C9A5A8]/[0.04] hover:border-[#C9A5A8]/40 hover:bg-[#C9A5A8]/[0.06]"
                          )}
                        >
                          {selectedPlan?.id === trialPlan.id && (
                            <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#3B0E1A] flex items-center justify-center">
                              <Check size={11} className="text-white" />
                            </span>
                          )}
                          <div className="flex items-start gap-3 pr-7">
                            <div className="h-11 w-11 rounded-xl border flex items-center justify-center shrink-0 border-[#C9A5A8]/30 bg-[#C9A5A8]/10">
                              <img src={imgPilates} alt="" className="h-7 w-7 object-contain" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#1A060B]/85 leading-snug">{trialPlan.name}</p>
                              <p className="text-[11px] text-[#1A060B]/45 mt-0.5 leading-snug">{trialPlan.description}</p>
                            </div>
                          </div>
                          <div className="flex items-baseline gap-1 mt-2">
                            <span className="text-2xl font-bold text-[#1A060B]">${Number(trialPlan.price ?? 0).toLocaleString("es-MX")}</span>
                            <span className="text-xs text-[#1A060B]/35">{trialPlan.currency ?? "MXN"}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="text-[10px] text-[#4a5638] bg-[#C9A5A8]/15 border border-[#C9A5A8]/25 rounded-full px-2 py-0.5">1 clase</span>
                            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">No transferible</span>
                            <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">No reembolsable</span>
                          </div>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Plan cards */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-[#3B0E1A]/70">
                      Paquetes de clases
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {plans.map((plan) => (
                        <PlanCard
                          key={plan.id}
                          plan={plan}
                          selected={selectedPlan?.id === plan.id}
                          onSelect={() => {
                            setSelectedPlan(plan);
                            setDiscountResult(null);
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Complementos de bienestar: feature retirada — ya no se
                      ofrecen al cliente (precios combo hardcodeados que no
                      correspondían a la configuración del estudio). */}
                </div>
              )}

              {/* Summary + continue */}
              {selectedPlan && (
                <div className="rounded-2xl border border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] p-4 space-y-4">
                  <div className="text-xs text-[#1A060B]/60 space-y-1.5">
                    <p><strong className="text-[#1A060B]/80">{selectedPlan.name}</strong></p>
                  </div>

                  {/* Discount code */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-[#320C16] leading-snug">
                      ¿Tienes un <strong>código de descuento</strong>? Aplícalo aquí.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3B0E1A]/50" />
                        <Input
                          className="pl-8 bg-[#3B0E1A]/[0.06] border-[#3B0E1A]/15 text-[#1A060B] placeholder:text-[#3B0E1A]/40 uppercase"
                          placeholder="Ej. FAMILIA10 o el código de tu amiga"
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        />
                      </div>
                      <button
                        onClick={() => validateCodeMutation.mutate()}
                        disabled={!discountCode || validateCodeMutation.isPending}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-[#3B0E1A]/30 text-[#3B0E1A] bg-[#3B0E1A]/5 hover:bg-[#3B0E1A]/10 transition-all disabled:opacity-40"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                  {discountResult && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <Check size={12} /> Cupón <strong className="font-mono">{discountResult.code?.code ?? discountResult.code ?? ""}</strong> aplicado: −${(discountResult.discount_amount ?? 0).toLocaleString("es-MX")} MXN
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between py-3 border-t border-[#3B0E1A]/15">
                    <span className="text-sm text-[#1A060B]/60">Total a pagar</span>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-[#1A060B]">${basePrice.toLocaleString("es-MX")} <span className="text-sm font-normal text-[#1A060B]/35">MXN</span></span>
                      {cashTransferPrice && cashTransferPrice < basePrice && (
                        <p className="text-[11px] text-[#1a6b0a] font-bold mt-0.5">
                          💰 Transferencia: ${cashTransferPrice.toLocaleString("es-MX")}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setStep("method")}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-[#3B0E1A] hover:bg-[#320C16] transition-colors"
                  >
                    Seleccionar método de pago <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Payment method ── */}
          {step === "method" && (
            <div className="space-y-4">
              <button onClick={() => setStep("select")} className="flex items-center gap-1.5 text-xs text-[#1A060B]/40 hover:text-[#1A060B]/70 transition-colors">
                <ArrowLeft size={13} /> Cambiar plan
              </button>

              <div className="rounded-2xl border border-[#3B0E1A]/20 bg-[#3B0E1A]/5 px-4 py-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#1A060B]/70">{selectedPlan?.name}</span>
                  <div className="text-right">
                    {paymentMethod === "transfer" && cashTransferPrice && cashTransferPrice < basePrice ? (
                      <>
                        <span className="text-xs text-[#1A060B]/30 line-through mr-2">${basePrice.toLocaleString("es-MX")}</span>
                        <span className="text-lg font-bold text-[#1a6b0a]">${finalAmount.toLocaleString("es-MX")} MXN</span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-[#1A060B]">${finalAmount.toLocaleString("es-MX")} MXN</span>
                    )}
                  </div>
                </div>
                {paymentMethod === "transfer" && cashTransferPrice && cashTransferPrice < basePrice && (
                  <p className="text-[11px] text-[#1a6b0a] font-bold mt-1.5 flex items-center gap-1">
                    💰 Ahorras ${(basePrice - cashTransferPrice).toLocaleString("es-MX")} pagando por transferencia
                  </p>
                )}
                {/* Sin recargo por pago con tarjeta. El estudio absorbe la comisión de MercadoPago. */}
              </div>

              <p className="text-sm font-semibold text-[#1A060B]/80">¿Cómo quieres pagar?</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={cn(
                    "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all",
                    paymentMethod === "transfer"
                      ? "border-[#3B0E1A]/50 bg-[#FFE4EE]"
                      : "border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] hover:border-[#3B0E1A]/25"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", paymentMethod === "transfer" ? "bg-[#C9A5A8]/20 text-[#C9A5A8]" : "bg-[#3B0E1A]/[0.06] text-[#1A060B]/40")}>
                    <Building2 size={22} />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-sm font-semibold", paymentMethod === "transfer" ? "text-[#C9A5A8]" : "text-[#1A060B]/60")}>Transferencia</p>
                    <p className="text-[10px] text-[#1A060B]/30 mt-0.5">SPEI / banco</p>
                  </div>
                  {paymentMethod === "transfer" && (
                    <span className="w-5 h-5 rounded-full bg-[#3B0E1A] flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={cn(
                    "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all",
                    paymentMethod === "card"
                      ? "border-[#3B0E1A]/50 bg-[#FFE4EE]"
                      : "border-[#3B0E1A]/15 bg-[#3B0E1A]/[0.04] hover:border-[#3B0E1A]/25"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", paymentMethod === "card" ? "bg-[#3B0E1A]/20 text-[#3B0E1A]" : "bg-[#3B0E1A]/[0.06] text-[#1A060B]/40")}>
                    <CreditCard size={22} />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-sm font-semibold", paymentMethod === "card" ? "text-[#3B0E1A]" : "text-[#1A060B]/60")}>Tarjeta de crédito/débito</p>
                    <p className="text-[10px] text-[#1A060B]/30 mt-0.5">Pago en línea seguro · sin comisión</p>
                  </div>
                  {paymentMethod === "card" && (
                    <span className="w-5 h-5 rounded-full bg-[#3B0E1A] flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </span>
                  )}
                </button>
              </div>

              <button
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-[#3B0E1A] hover:bg-[#320C16] transition-colors disabled:opacity-50"
              >
                {createOrderMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
                {createOrderMutation.isPending
                  ? "Procesando…"
                  : paymentMethod === "card" ? "Pagar con tarjeta" : "Confirmar"}
              </button>
            </div>
          )}

          {/* ── Step 3a: Bank details (transfer) ── */}
          {step === "bank" && bankDetails && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-5 space-y-1">
                <p className="text-base font-bold text-[#1A060B] mb-1">Datos de transferencia SPEI</p>
                <p className="text-sm text-[#320C16] mb-4">Realiza la transferencia y luego sube tu comprobante.</p>
                {[
                  // Solo CLABE para SPEI — el número de cuenta no se muestra.
                  { label: "CLABE", value: bankDetails.clabe },
                  { label: "Banco", value: bankDetails.bank },
                  { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                  { label: "Monto", value: `$${bankDetails.amount?.toLocaleString("es-MX")} MXN` },
                ].map(({ label, value }) => value && (
                  <div key={label} className="flex items-center justify-between py-3 border-b border-[#EADCDD] last:border-0">
                    <span className="text-sm text-[#320C16] font-medium">{label}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(String(value).replace(/\s/g, "")); toast({ title: `${label} copiado` }); }}
                      className="flex items-center gap-2 group"
                    >
                      <span className="font-mono text-sm font-bold text-[#1A060B] select-all">{value}</span>
                      <span className="w-7 h-7 rounded-lg bg-[#3B0E1A]/10 flex items-center justify-center text-[#3B0E1A] group-hover:bg-[#3B0E1A]/20 transition-colors">
                        <Copy size={13} />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#320C16] text-center">Toca cualquier dato para copiarlo al portapapeles</p>
              <button onClick={() => setStep("upload")} className="w-full py-3.5 rounded-xl font-semibold text-white bg-[#3B0E1A] hover:bg-[#320C16] transition-colors text-sm tracking-wide uppercase">
                Ya realicé la transferencia →
              </button>
            </div>
          )}

          {/* ── Step 3b: Pago con tarjeta en estudio ── */}
          {step === "cash" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#3B0E1A]/20 bg-[#3B0E1A]/5 p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#3B0E1A]/15 flex items-center justify-center mx-auto">
                  <CreditCard size={26} className="text-[#3B0E1A]" />
                </div>
                <p className="font-semibold text-[#1A060B]">Pago con tarjeta en el estudio</p>
                <p className="text-sm text-[#1A060B]/55">Acércate a la recepción con tu tarjeta y el número de orden para completar el pago en la terminal.</p>
                {orderId && (
                  <div className="bg-[#3B0E1A]/[0.06] border border-[#3B0E1A]/15 rounded-xl px-4 py-2 inline-block">
                    <p className="text-[10px] text-[#1A060B]/35 uppercase tracking-wider mb-0.5">Número de orden</p>
                    <p className="font-mono font-bold text-[#1A060B] text-sm">{orderId}</p>
                  </div>
                )}
                <p className="text-xs text-[#1A060B]/30">Tu paquete se activará una vez que el equipo confirme el pago.</p>
              </div>
              <button onClick={() => window.location.replace("/app")} className="w-full py-3 rounded-xl font-semibold text-white bg-[#3B0E1A] hover:bg-[#320C16] transition-colors">
                Ir a mi panel
              </button>
            </div>
          )}

          {/* ── Step 4: Upload proof ── */}
          {step === "upload" && (
            <div className="rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-5 space-y-4">
              <div>
                <p className="font-semibold text-[#1A060B]">Sube tu comprobante</p>
                <p className="text-xs text-[#320C16] mt-1">
                  Hasta {MAX_PROOFS} imágenes claras (JPG, PNG, WEBP). Tu membresía se activa al instante.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative aspect-square rounded-xl border border-[#3B0E1A]/20 bg-[#3B0E1A]/[0.04] overflow-hidden">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/90 text-white text-xs flex items-center justify-center"
                      aria-label="Quitar"
                    >×</button>
                  </div>
                ))}
                {files.length < MAX_PROOFS && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-[#3B0E1A]/30 flex flex-col items-center justify-center cursor-pointer hover:bg-[#3B0E1A]/[0.04] text-[#3B0E1A]">
                    <Upload size={20} />
                    <span className="text-[10px] mt-1">Agregar</span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => onAddFiles(e.target.files)}
                    />
                  </label>
                )}
              </div>
              <button
                disabled={files.length === 0 || uploadProofMutation.isPending}
                onClick={() => uploadProofMutation.mutate()}
                className="w-full py-3 rounded-xl font-semibold text-white bg-[#3B0E1A] hover:bg-[#320C16] transition-colors disabled:opacity-50"
              >
                {uploadProofMutation.isPending
                  ? "Subiendo…"
                  : `Confirmar pago (${files.length}/${MAX_PROOFS})`}
              </button>
              <button
                type="button"
                onClick={showBankDetailsAgain}
                disabled={loadingBankAgain}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[#320C16] hover:text-[#1A060B] transition-colors disabled:opacity-50"
              >
                {loadingBankAgain
                  ? <Loader2 size={13} className="animate-spin" />
                  : <ArrowLeft size={13} />}
                Volver a ver los datos de transferencia
              </button>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === "done" && (
            <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/5 p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#4ade80]/12 border border-[#4ade80]/30 flex items-center justify-center mx-auto">
                <CheckCircle size={30} className="text-[#4ade80]" />
              </div>
              <p className="text-base font-semibold text-[#1A060B]">¡Tu membresía está activa!</p>
              <p className="text-sm text-[#320C16]">
                Ya puedes reservar tus clases. La admin verificará el comprobante en las próximas 24 horas — te avisamos si encuentra algún detalle.
              </p>
              <button onClick={() => window.location.replace("/app")} className="mt-2 px-6 py-2.5 rounded-xl text-sm font-semibold border border-[#3B0E1A]/20 text-[#1A060B]/70 hover:text-[#1A060B] hover:border-[#3B0E1A]/30 transition-all">
                Ir a mi panel
              </button>
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Checkout;
