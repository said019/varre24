import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check, Copy, Upload, ArrowLeft, ArrowRight, Loader2, CheckCircle,
  Users, Timer, PartyPopper, CreditCard, Building2,
} from "lucide-react";
import { CLASS_PHOTOS } from "@/components/landing/photoAssets";

type Step = "select" | "details" | "bank" | "cash" | "upload" | "done";
type PaymentMethod = "transfer" | "card" | "cash";

interface EventPackage {
  id: string;
  name: string;
  description: string;
  price: string;
  discount_price: string | null;
  max_guests: number;
  duration_min: number;
  includes: string[];
}

// Compresión ligera de comprobantes (mismo criterio que Checkout).
function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
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

const STEPS: { id: Step; label: string }[] = [
  { id: "select", label: "Paquete" },
  { id: "details", label: "Detalles" },
  { id: "upload", label: "Pago" },
  { id: "done", label: "Listo" },
];

const StepBar = ({ current }: { current: Step }) => {
  const order: Step[] = ["select", "details", "bank", "cash", "upload", "done"];
  const currentIdx = order.indexOf(current);
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const sIdx = order.indexOf(s.id);
        const done = currentIdx > sIdx;
        const active = s.id === current || (["bank", "cash"].includes(current) && s.id === "upload");
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && <div className={cn("h-px w-6 rounded", done ? "bg-[#3B0E1A]/60" : "bg-[#3B0E1A]/10")} />}
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 font-alilato text-xs font-medium transition-all",
              active ? "border-[#3B0E1A]/40 bg-[#3B0E1A]/10 text-[#3B0E1A]"
                : done ? "border-emerald-500/30 bg-emerald-50 text-emerald-600"
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

const inputCls =
  "rounded-xl border-[#E9D9D9] bg-[#FCF8F7] font-alilato text-[#1A060B] placeholder:text-[#9C8A8B]/60 focus:border-[#3B0E1A] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors";
const labelCls = "font-alilato text-[0.66rem] uppercase tracking-[0.18em] text-[#9C8A8B]";

const EventBooking = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [pkg, setPkg] = useState<EventPackage | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("17:00");
  const [guests, setGuests] = useState(4);
  const [contactName, setContactName] = useState(user?.displayName ?? user?.display_name ?? "");
  const [contactPhone, setContactPhone] = useState(user?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [orderUuid, setOrderUuid] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const MAX_PROOFS = 3;
  const [files, setFiles] = useState<File[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["public-event-packages"],
    queryFn: async () => (await api.get("/public/event-packages")).data,
    staleTime: 1000 * 60 * 10,
  });
  const packages: EventPackage[] = Array.isArray(data?.data) ? data.data : [];

  const minDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/orders/event", {
        packageId: pkg!.id,
        eventDate, eventTime, guests,
        contactName, contactPhone, contactEmail, notes,
        paymentMethod,
      }),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      setOrderUuid(d.id);
      setOrderNumber(d.order_number ?? d.id);
      setBankDetails(d.bank_details ?? d.bankDetails);
      const checkoutUrl = d.mp_checkout_url ?? d.mpCheckoutUrl;
      if (paymentMethod === "card") {
        if (checkoutUrl) { window.location.href = checkoutUrl; return; }
        toast({
          title: "No pudimos iniciar el pago en línea",
          description: "Tu solicitud quedó guardada. Reintenta el pago desde \"Mis órdenes\".",
          variant: "destructive",
        });
        window.location.href = "/app/orders";
        return;
      }
      if (paymentMethod === "transfer") setStep("bank");
      else setStep("cash");
    },
    onError: (err: any) =>
      toast({ title: "No se pudo crear la solicitud", description: err.response?.data?.message, variant: "destructive" }),
  });

  const uploadProofMutation = useMutation({
    mutationFn: async () => {
      if (!orderUuid) throw new Error("No se encontró la orden.");
      if (files.length === 0) throw new Error("Selecciona al menos un comprobante.");
      const fd = new FormData();
      for (const f of files) fd.append("files", await compressImage(f));
      return api.post(`/orders/${orderUuid}/proof`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      setStep("done");
    },
    onError: (err: any) =>
      toast({ title: "No se pudo subir", description: err?.message || err?.response?.data?.message, variant: "destructive" }),
  });

  const onAddFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_PROOFS));
  };

  const detailsValid =
    !!eventDate && !!eventTime && contactName.trim().length >= 2 && contactPhone.trim().length >= 8 &&
    guests >= 1 && (!pkg || guests <= pkg.max_guests);

  const priceFor = (p: EventPackage) => {
    const base = Number(p.price);
    const disc = p.discount_price != null ? Number(p.discount_price) : null;
    const isCashOrTransfer = paymentMethod === "cash" || paymentMethod === "transfer";
    return disc && disc > 0 && isCashOrTransfer ? disc : base;
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-2xl px-1 py-4 sm:py-8 space-y-6">

          {/* ── Encabezado editorial ── */}
          <div>
            <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B]">Eventos privados</p>
            <h1 className="mt-2 font-bebas text-[clamp(1.9rem,4.5vw,2.8rem)] font-light leading-[1.05] tracking-[0.01em] text-[#1A060B]">
              Celebra en VARRE24
            </h1>
            <p className="font-alilato mt-2 max-w-[52ch] text-sm text-[#3B0E1A]/70">
              Cumpleaños y celebraciones con el estudio exclusivo para tu grupo. Elige tu paquete, cuéntanos del festejo y paga en línea.
            </p>
          </div>

          <StepBar current={step} />

          {/* ── Paso 1: elegir paquete ── */}
          {step === "select" && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-[#E9D9D9]">
                <img
                  src={CLASS_PHOTOS.eventos.src}
                  alt={CLASS_PHOTOS.eventos.alt}
                  className="h-44 w-full object-cover"
                />
              </div>
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-72 w-full rounded-2xl" />)}
                </div>
              ) : packages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E9D9D9] bg-[#FCF8F7] p-8 text-center">
                  <p className="font-alilato text-sm text-[#3B0E1A]/70">
                    Estamos preparando los paquetes. Escríbenos desde tu perfil y con gusto armamos tu evento.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {packages.map((p) => {
                    const selected = pkg?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPkg(p)}
                        className={cn(
                          "relative flex h-full flex-col rounded-2xl border p-6 text-left transition-all duration-200",
                          selected ? "border-[#3B0E1A]/60 bg-[#FFE4EE]" : "border-[#E9D9D9] bg-[#FCF8F7] hover:-translate-y-0.5 hover:border-[#3B0E1A]/35"
                        )}
                      >
                        {selected && (
                          <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-[#3B0E1A]">
                            <Check size={11} className="text-[#F3EFE9]" />
                          </span>
                        )}
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C9A5A8]/25">
                          <PartyPopper size={18} className="text-[#8A5A5E]" strokeWidth={1.75} />
                        </span>
                        <p className="mt-4 font-alilato text-base font-medium text-[#1A060B]">{p.name}</p>
                        <p className="font-alilato mt-1 text-xs leading-relaxed text-[#3B0E1A]/60">{p.description}</p>
                        <p className="mt-4 flex items-baseline gap-1.5">
                          <span className="font-bebas text-[2rem] font-light leading-none text-[#1A060B]">
                            ${Number(p.price).toLocaleString("es-MX")}
                          </span>
                          <span className="font-alilato text-[0.62rem] text-[#9C8A8B]">MXN</span>
                        </p>
                        <div className="mt-3 flex items-center gap-4">
                          <span className="flex items-center gap-1.5 font-alilato text-[0.66rem] uppercase tracking-[0.1em] text-[#9C8A8B]">
                            <Users size={11} strokeWidth={1.75} /> hasta {p.max_guests}
                          </span>
                          <span className="flex items-center gap-1.5 font-alilato text-[0.66rem] uppercase tracking-[0.1em] text-[#9C8A8B]">
                            <Timer size={11} strokeWidth={1.75} /> {p.duration_min} min
                          </span>
                        </div>
                        {Array.isArray(p.includes) && p.includes.length > 0 && (
                          <ul className="mt-4 space-y-1.5 border-t border-[#E9D9D9] pt-4">
                            {p.includes.map((inc, i) => (
                              <li key={i} className="flex items-start gap-2 font-alilato text-xs text-[#3B0E1A]/70">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#C9A5A8]" />
                                {inc}
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                disabled={!pkg}
                onClick={() => { setGuests((g) => Math.min(g, pkg!.max_guests)); setStep("details"); }}
                className="press w-full rounded-full bg-[#3B0E1A] py-3.5 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] transition-colors hover:bg-[#320C16] disabled:opacity-40"
              >
                Continuar con los detalles
              </button>
            </div>
          )}

          {/* ── Paso 2: detalles del festejo ── */}
          {step === "details" && pkg && (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="flex items-center gap-1.5 font-alilato text-[0.7rem] uppercase tracking-[0.16em] text-[#9C8A8B] transition-colors hover:text-[#3B0E1A]"
              >
                <ArrowLeft size={13} strokeWidth={1.75} /> Cambiar paquete
              </button>

              <div className="rounded-2xl border border-[#E9D9D9] bg-[#FCF8F7] p-5">
                <p className="font-alilato text-sm font-medium text-[#1A060B]">{pkg.name}</p>
                <p className="font-alilato mt-0.5 text-xs text-[#3B0E1A]/60">
                  hasta {pkg.max_guests} invitadas · {pkg.duration_min} min
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelCls}>Fecha del evento</Label>
                  <Input type="date" min={minDate} value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className={labelCls}>Hora</Label>
                  <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className={labelCls}>Invitadas ({guests} de {pkg.max_guests} máx.)</Label>
                <Input
                  type="number" min={1} max={pkg.max_guests} value={guests}
                  onChange={(e) => setGuests(Math.max(1, Math.min(pkg.max_guests, parseInt(e.target.value) || 1)))}
                  className={inputCls}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelCls}>Nombre de contacto</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className={labelCls}>Teléfono</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+521234567890" className={inputCls} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className={labelCls}>Email</Label>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-2">
                <Label className={labelCls}>Notas del festejo (opcional)</Label>
                <Textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tema, decoración, pastel, música, alguna sorpresa…"
                  className={inputCls}
                />
              </div>

              {/* Método de pago */}
              <div className="space-y-2">
                <Label className={labelCls}>Método de pago</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "transfer", label: "Transferencia", icon: Building2 },
                    { id: "card", label: "Tarjeta", icon: CreditCard },
                    { id: "cash", label: "En estudio", icon: Users },
                  ] as { id: PaymentMethod; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentMethod(id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 font-alilato text-xs transition-all",
                        paymentMethod === id
                          ? "border-[#3B0E1A]/50 bg-[#FFE4EE] text-[#1A060B]"
                          : "border-[#E9D9D9] bg-[#FCF8F7] text-[#3B0E1A]/60 hover:border-[#3B0E1A]/30"
                      )}
                    >
                      <Icon size={15} strokeWidth={1.75} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-[#E9D9D9] pt-4">
                <span className="font-alilato text-sm text-[#3B0E1A]/70">Total a pagar</span>
                <span className="font-bebas text-2xl font-light text-[#1A060B]">
                  ${priceFor(pkg).toLocaleString("es-MX")} <span className="font-alilato text-xs text-[#9C8A8B]">MXN</span>
                </span>
              </div>

              <button
                type="button"
                disabled={!detailsValid || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="press flex w-full items-center justify-center gap-2 rounded-full bg-[#3B0E1A] py-3.5 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] transition-colors hover:bg-[#320C16] disabled:opacity-40"
              >
                {createMutation.isPending
                  ? <Loader2 size={15} className="animate-spin" />
                  : <>{paymentMethod === "card" ? "Continuar al pago" : "Reservar mi evento"} <ArrowRight size={14} /></>}
              </button>
            </div>
          )}

          {/* ── Paso 3a: datos de transferencia ── */}
          {step === "bank" && bankDetails && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-2xl border border-[#E9D9D9] bg-[#FCF8F7] p-5">
                <p className="mb-1 font-alilato text-base font-medium text-[#1A060B]">Datos de transferencia SPEI</p>
                <p className="mb-4 font-alilato text-sm text-[#320C16]">Realiza la transferencia y luego sube tu comprobante.</p>
                {[
                  { label: "CLABE", value: bankDetails.clabe },
                  { label: "Banco", value: bankDetails.bank },
                  { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                  { label: "Tarjeta", value: bankDetails.card_number },
                  { label: "Monto", value: `$${Number(bankDetails.amount).toLocaleString("es-MX")} MXN` },
                ].map(({ label, value }) => value && (
                  <div key={label} className="flex items-center justify-between border-b border-[#EADCDD] py-3 last:border-0">
                    <span className="font-alilato text-sm font-medium text-[#320C16]">{label}</span>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(String(value).replace(/\s/g, "")); toast({ title: `${label} copiado` }); }}
                      className="group flex items-center gap-2"
                    >
                      <span className="select-all font-mono text-sm font-bold text-[#1A060B]">{value}</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3B0E1A]/10 text-[#3B0E1A] transition-colors group-hover:bg-[#3B0E1A]/20">
                        <Copy size={13} />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="press w-full rounded-full bg-[#3B0E1A] py-3.5 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] transition-colors hover:bg-[#320C16]"
              >
                Ya realicé la transferencia →
              </button>
            </div>
          )}

          {/* ── Paso 3b: pago en estudio ── */}
          {step === "cash" && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-[#E9D9D9] bg-[#FFE4EE] p-6 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FCF8F7]">
                  <CreditCard size={24} className="text-[#3B0E1A]" strokeWidth={1.75} />
                </span>
                <p className="font-alilato font-medium text-[#1A060B]">Pago en el estudio</p>
                <p className="font-alilato text-sm text-[#3B0E1A]/65">
                  Acércate a recepción con tu número de orden para confirmar tu evento.
                </p>
                {orderNumber && (
                  <div className="inline-block rounded-xl border border-[#E9D9D9] bg-[#FCF8F7] px-4 py-2">
                    <p className="font-alilato text-[10px] uppercase tracking-wider text-[#9C8A8B]">Número de orden</p>
                    <p className="font-mono text-sm font-bold text-[#1A060B]">{orderNumber}</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.location.replace("/app/orders")}
                className="press w-full rounded-full bg-[#3B0E1A] py-3.5 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] transition-colors hover:bg-[#320C16]"
              >
                Ver mis órdenes
              </button>
            </div>
          )}

          {/* ── Paso 4: subir comprobante ── */}
          {step === "upload" && (
            <div className="space-y-4 rounded-2xl border border-[#E9D9D9] bg-[#FCF8F7] p-5">
              <div>
                <p className="font-alilato font-medium text-[#1A060B]">Sube tu comprobante</p>
                <p className="font-alilato mt-1 text-xs text-[#320C16]">
                  Hasta {MAX_PROOFS} imágenes claras (JPG, PNG, WEBP).
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-[#3B0E1A]/20 bg-[#3B0E1A]/[0.04]">
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-xs text-white"
                      aria-label="Quitar"
                    >×</button>
                  </div>
                ))}
                {files.length < MAX_PROOFS && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#3B0E1A]/30 text-[#3B0E1A] hover:bg-[#3B0E1A]/[0.04]">
                    <Upload size={20} />
                    <span className="mt-1 text-[10px]">Agregar</span>
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
                type="button"
                disabled={files.length === 0 || uploadProofMutation.isPending}
                onClick={() => uploadProofMutation.mutate()}
                className="press w-full rounded-full bg-[#3B0E1A] py-3.5 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] transition-colors hover:bg-[#320C16] disabled:opacity-50"
              >
                {uploadProofMutation.isPending ? "Subiendo…" : `Confirmar pago (${files.length}/${MAX_PROOFS})`}
              </button>
              <button
                type="button"
                onClick={() => setStep("bank")}
                className="flex w-full items-center justify-center gap-1.5 font-alilato text-xs text-[#320C16] transition-colors hover:text-[#1A060B]"
              >
                <ArrowLeft size={13} /> Volver a ver los datos de transferencia
              </button>
            </div>
          )}

          {/* ── Paso 5: listo ── */}
          {step === "done" && (
            <div className="space-y-4 rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/5 p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#4ade80]/30 bg-[#4ade80]/12">
                <CheckCircle size={30} className="text-[#4ade80]" />
              </div>
              <p className="font-alilato text-base font-medium text-[#1A060B]">¡Tu evento está en camino!</p>
              <p className="font-alilato text-sm text-[#320C16]">
                Recibimos tu comprobante. El estudio confirmará tu pago y se pondrá en contacto contigo para afinar los detalles del festejo.
              </p>
              <button
                type="button"
                onClick={() => window.location.replace("/app/orders")}
                className="press mt-2 rounded-full border border-[#3B0E1A]/20 px-6 py-2.5 font-alilato text-sm font-medium text-[#1A060B]/70 transition-all hover:border-[#3B0E1A]/35 hover:text-[#1A060B]"
              >
                Ver mis órdenes
              </button>
            </div>
          )}

        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default EventBooking;
