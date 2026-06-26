import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import pilatesRoomLogo from "@/assets/pilates-room-logo.png";
import authPhoto from "@/assets/pilates-room-images/auth-team.webp";

const schema = z.object({ email: z.string().email("Email inválido") });
type FormValues = { email: string };

const ForgotPassword = () => {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", data);
      setSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message ?? "Inténtalo de nuevo", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT PANEL — foto ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#4A3329]">
        <img
          src={authPhoto}
          alt="Equipo de instructoras de Pilates Room"
          className="absolute inset-x-0 top-0 w-full object-contain object-top"
          style={{ height: 'auto', aspectRatio: '1600/1067' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(74,51,41,0.55)_0%,rgba(74,51,41,0.20)_30%,rgba(74,51,41,0.85)_72%,rgba(74,51,41,0.97)_100%)]" />
        <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle,#C8B79E_0%,transparent_70%)] opacity-20 animate-mesh pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="block">
            <img src={pilatesRoomLogo} alt="Pilates Room" className="h-20 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 border border-white/40 px-4 py-[7px] rounded-full text-xs tracking-[0.18em] uppercase text-white/90 mb-6">
              <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
              Pilates Reformer · GDL
            </div>
            <h2 className="font-bebas text-[clamp(2.8rem,4.8vw,5rem)] leading-[0.9] text-white tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.4)]">
              VUELVE A
              <span className="block font-editorial italic font-light text-[#E8D9C5] normal-case">
                tu práctica.
              </span>
            </h2>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Link to="/">
            <img src={pilatesRoomLogo} alt="Pilates Room" className="h-16 w-auto" />
          </Link>
        </div>
        {sent ? (
          <div className="text-center space-y-3">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-xl font-bold">Revisa tu email</h2>
            <p className="text-sm text-muted-foreground">
              Si el email está registrado recibirás un enlace para restablecer tu contraseña.
            </p>
            <Link to="/auth/login" className="text-primary hover:underline text-sm">Volver al inicio</Link>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
              <p className="text-sm text-muted-foreground mt-1">Te enviaremos un enlace por email</p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="tu@email.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Enviar enlace
              </Button>
            </form>
            <p className="text-center text-sm">
              <Link to="/auth/login" className="text-primary hover:underline">Volver al inicio</Link>
            </p>
          </>
        )}
      </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
