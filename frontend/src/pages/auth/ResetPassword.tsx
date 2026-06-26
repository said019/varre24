import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import pilatesRoomLogo from "@/assets/pilates-room-logo.png";
import authPhoto from "@/assets/pilates-room-images/auth-team.webp";

const schema = z.object({
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[0-9]/, "Debe incluir un número"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormValues = { password: string; confirmPassword: string };

const ResetPassword = () => {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get("token");

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    if (!token) { toast({ title: "Token inválido", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password: data.password });
      setDone(true);
      setTimeout(() => navigate("/auth/login"), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message ?? "Link inválido o expirado", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT PANEL — foto ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#2B0911]">
        <img
          src={authPhoto}
          alt="Equipo de instructoras de VARRE24"
          className="absolute inset-x-0 top-0 w-full object-contain object-top"
          style={{ height: 'auto', aspectRatio: '1600/1067' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(74,51,41,0.55)_0%,rgba(74,51,41,0.20)_30%,rgba(74,51,41,0.85)_72%,rgba(74,51,41,0.97)_100%)]" />
        <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle,#E7C9CF_0%,transparent_70%)] opacity-20 animate-mesh pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="block">
            <img src={pilatesRoomLogo} alt="VARRE24" className="h-20 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 border border-white/40 px-4 py-[7px] rounded-full text-xs tracking-[0.18em] uppercase text-white/90 mb-6">
              <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
              Barre &amp; Pilates · CDMX
            </div>
            <h2 className="font-bebas text-[clamp(2.8rem,4.8vw,5rem)] leading-[0.9] text-white tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.4)]">
              UN NUEVO
              <span className="block font-editorial italic font-light text-[#F3CCD4] normal-case">
                comienzo.
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
            <img src={pilatesRoomLogo} alt="VARRE24" className="h-16 w-auto" />
          </Link>
        </div>
        {done ? (
          <div className="text-center space-y-3">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-xl font-bold">¡Contraseña actualizada!</h2>
            <p className="text-sm text-muted-foreground">Redirigiendo al inicio de sesión...</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Nueva contraseña</h1>
              <p className="text-sm text-muted-foreground mt-1">Ingresa tu nueva contraseña</p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Nueva contraseña</Label>
                <Input type="password" placeholder="••••••••" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Confirmar contraseña</Label>
                <Input type="password" placeholder="••••••••" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Cambiar contraseña
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

export default ResetPassword;
