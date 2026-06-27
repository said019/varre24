import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowRight, CheckCircle, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";

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

  const heading = (
    <>
      <p className="font-alilato text-[0.72rem] tracking-[0.18em] uppercase text-[#3B0E1A] font-semibold mb-3 flex items-center gap-2">
        <span className="w-5 h-[1px] bg-[#3B0E1A] inline-block" />
        Recuperación
      </p>
      <h1 className="font-editorial text-[2.4rem] sm:text-[2.7rem] leading-[1.05] tracking-[-0.015em] text-foreground">
        Recuperar <span className="italic font-light">contraseña</span>
      </h1>
    </>
  );

  return (
    <AuthLayout heading={heading}>
      {sent ? (
        <div className="rounded-2xl border border-[#E9D9D9] bg-[#FCF8F7] p-7 text-center">
          <CheckCircle className="mx-auto text-[#3B0E1A]" size={44} />
          <h2 className="font-bebas text-[1.85rem] leading-none text-foreground tracking-tight mt-4">
            Revisa tu
            <span className="font-editorial italic font-light text-[#3B0E1A] normal-case text-[1.3rem] ml-1.5">
              email.
            </span>
          </h2>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed font-alilato">
            Si el email está registrado recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link
            to="/auth/login"
            className="press mt-6 inline-flex items-center justify-center gap-2 text-sm font-semibold tracking-[0.12em] uppercase text-[#3B0E1A] hover:text-[#3B0E1A]/80 transition-colors no-underline"
          >
            <ArrowLeft size={15} />
            Volver al inicio
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground -mt-4 mb-7 leading-relaxed font-alilato">
            Te enviaremos un enlace por email para restablecer tu acceso.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                {...register("email")}
                className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="press mt-1 bg-[#3B0E1A] text-[#F3EFE9] py-4 rounded-full text-sm font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_rgba(124,1,22,0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Enviar enlace
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-[1px] bg-border" />
            <span className="text-xs text-muted-foreground font-alilato">¿Ya la recordaste?</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          <Link
            to="/auth/login"
            className="press flex items-center justify-center gap-2 w-full py-4 rounded-full border border-[#E9D9D9] text-[#3B0E1A] text-sm font-semibold tracking-[0.12em] uppercase hover:border-[#3B0E1A] hover:bg-[#FCF8F7] transition-all no-underline"
          >
            <ArrowLeft size={15} />
            Volver al inicio
          </Link>

          <p className="text-center text-xs text-muted-foreground/50 mt-6 font-alilato">
            © {new Date().getFullYear()} VARRE24 · Nápoles, CDMX
          </p>
        </>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
