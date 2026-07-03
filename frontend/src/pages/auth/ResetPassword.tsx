import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ArrowRight } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AUTH_PHOTOS } from "@/components/landing/photoAssets";

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

  const heading = (
    <>
      <p className="font-alilato text-[0.72rem] tracking-[0.18em] uppercase text-[#8A5A5E] font-semibold mb-3 flex items-center gap-2">
        <span className="w-5 h-[2px] rounded-full bg-[#FFD6E6] inline-block" />
        Un nuevo comienzo
      </p>
      <h1 className="font-editorial text-[2.4rem] sm:text-[2.7rem] leading-[1.05] tracking-[-0.015em] text-foreground">
        Nueva <span className="italic font-light">contraseña</span>
      </h1>
    </>
  );

  return (
    <AuthLayout heading={heading} photo={AUTH_PHOTOS.reset}>
      {done ? (
        <div className="rounded-2xl border border-[#E9D9D9] bg-[#FCF8F7] p-7 text-center">
          <CheckCircle className="mx-auto text-[#3B0E1A]" size={44} />
          <h2 className="font-bebas text-[1.85rem] leading-none text-foreground tracking-tight mt-4">
            Contraseña
            <span className="font-editorial italic font-light text-[#3B0E1A] normal-case text-[1.3rem] ml-1.5">
              actualizada.
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed font-alilato">
            Redirigiendo al inicio de sesión…
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground -mt-4 mb-7 leading-relaxed font-alilato">
            Ingresa tu nueva contraseña para recuperar el acceso.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Nueva contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register("password")}
                className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Confirmar contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                {...register("confirmPassword")}
                className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              {errors.confirmPassword && <span className="text-xs text-destructive">{errors.confirmPassword.message}</span>}
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="press mt-2 bg-[#3B0E1A] text-[#F3EFE9] py-4 rounded-full text-sm font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_rgba(59,14,26,0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Cambiar contraseña
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-muted-foreground font-alilato">
            <Link to="/auth/login" className="text-[#3B0E1A] font-medium underline-offset-4 hover:underline">
              Volver al inicio
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
};

export default ResetPassword;
