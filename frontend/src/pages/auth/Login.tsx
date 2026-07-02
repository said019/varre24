import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowRight, Share, Plus, MoreVertical, Smartphone, RefreshCw } from "lucide-react";
import { hardResetSession } from "@/lib/session";
import { AuthLayout } from "@/components/auth/AuthLayout";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Requerido"),
});
type FormValues = { email: string; password: string };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#3B0E1A] text-[#F3EFE9] text-[0.65rem] font-semibold flex items-center justify-center mt-0.5 tabular">
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}

const Login = () => {
  const { login, isLoading, error, clearError, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<"ios" | "android">("android");
  const [isStandalone, setIsStandalone] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && (navigator as any).standalone);
    if (standalone) { setIsStandalone(true); return; }
    const ua = navigator.userAgent.toLowerCase();
    setInstallPlatform(/iphone|ipad|ipod/.test(ua) ? "ios" : "android");
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Destino tras autenticarse. Clientes SIEMPRE van a /app (o al returnUrl): el
  // dashboard ya muestra el estado de membresía y un CTA para comprar si no
  // tiene plan. Se quitó el fetch de /memberships/my que decidía la navegación
  // y mandaba a /app/checkout con un toast "no tienes clases activas": era
  // frágil y, combinado con el loop de 401, dejaba a la alumna rebotando entre
  // pantallas. Todas las navegaciones usan replace para no apilar historial.
  const destinationFor = (role: string | undefined) => {
    const returnUrl = params.get("returnUrl");
    if (returnUrl) return returnUrl;
    if (["admin", "super_admin", "instructor", "reception"].includes(role ?? "")) return "/admin/dashboard";
    return "/app";
  };

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    navigate(destinationFor(user.role), { replace: true });
  }, [isAuthenticated, user]);

  const onSubmit = async (data: FormValues) => {
    clearError();
    try {
      await login(data);
      const { user: authedUser } = useAuthStore.getState();
      navigate(destinationFor(authedUser?.role), { replace: true });
    } catch {
      toast({ title: "Error al iniciar sesión", description: error ?? "Verifica tus credenciales", variant: "destructive" });
    }
  };

  const heading = (
    <>
      <p className="font-alilato text-[0.72rem] tracking-[0.18em] uppercase text-[#8A5A5E] font-semibold mb-3 flex items-center gap-2">
        <span className="w-5 h-[2px] rounded-full bg-[#FFD6E6] inline-block" />
        Bienvenida de vuelta
      </p>
      <h1 className="font-editorial text-[2.4rem] sm:text-[2.7rem] leading-[1.05] tracking-[-0.015em] text-foreground">
        Iniciar <span className="italic font-light">sesión</span>
      </h1>
    </>
  );

  return (
    <AuthLayout heading={heading}>
      {/* error global */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl mb-6 font-alilato">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

        {/* email */}
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

        {/* password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
            <Link to="/auth/forgot-password" className="text-xs text-[#3B0E1A] hover:text-[#3B0E1A]/80 transition-colors no-underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
              className="font-alilato w-full bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3.5 pr-12 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
        </div>

        {/* submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="press mt-2 bg-[#3B0E1A] text-[#F3EFE9] py-4 rounded-full text-sm font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_rgba(59,14,26,0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Entrar
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      {/* crear cuenta — inline, minimal */}
      <p className="mt-7 text-center text-sm text-muted-foreground font-alilato">
        ¿Primera vez?{" "}
        <Link to="/auth/register" className="text-[#3B0E1A] font-medium underline-offset-4 hover:underline">
          Crea tu cuenta
        </Link>
      </p>

      {/* Recuperación — link discreto para sesiones atoradas */}
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={async () => {
            setResetting(true);
            try { await hardResetSession(); }
            catch { setResetting(false); }
          }}
          disabled={resetting}
          className="inline-flex items-center justify-center gap-1.5 text-[0.72rem] text-muted-foreground/70 hover:text-[#3B0E1A] transition-colors disabled:opacity-60 font-alilato"
        >
          {resetting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {resetting ? "Reiniciando…" : "¿Problemas para entrar? Reiniciar la app"}
        </button>
      </div>

      {/* PWA Install — colapsado por defecto para mantener la vista limpia */}
      {!isStandalone && (
        <details className="group mt-10 rounded-2xl border border-[#E9D9D9] bg-[#FCF8F7] px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-alilato text-[#260910]">
            <span className="inline-flex items-center gap-2">
              <Smartphone size={14} className="text-[#3B0E1A]" />
              Instala VARRE24 en tu teléfono
            </span>
            <span className="text-muted-foreground/60 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-4">

          {/* Tabs iOS / Android */}
          <div className="inline-flex p-0.5 bg-[#FCF8F7] rounded-full border border-[#3B0E1A]/15 mb-4">
            {(["android", "ios"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInstallPlatform(p)}
                className={`press px-4 py-1.5 rounded-full text-[0.7rem] tracking-[0.14em] uppercase font-semibold transition-colors ${
                  installPlatform === p
                    ? "bg-[#3B0E1A] text-[#F3EFE9] shadow-soft"
                    : "text-[#260910] hover:text-[#1A060B]"
                }`}
              >
                <Smartphone size={11} className="inline -mt-0.5 mr-1.5" />
                {p === "android" ? "Android" : "iPhone"}
              </button>
            ))}
          </div>

          {/* Pasos */}
          <ol className="space-y-2.5 text-[0.82rem] text-[#1A060B]/85 leading-[1.55] font-alilato">
            {installPlatform === "ios" ? (
              <>
                <Step n={1}>
                  Abre el sitio en <span className="font-semibold">Safari</span> y toca el botón
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FCF8F7] border border-[#3B0E1A]/20 text-[#3B0E1A]">
                    <Share size={11} />
                    <span className="text-[0.7rem] font-medium text-[#1A060B]">Compartir</span>
                  </span>
                </Step>
                <Step n={2}>
                  Desliza y elige
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FCF8F7] border border-[#3B0E1A]/20 text-[0.74rem] font-medium">
                    <Plus size={11} className="text-[#3B0E1A]" /> Agregar a pantalla de inicio
                  </span>
                </Step>
                <Step n={3}>
                  Confirma tocando <span className="font-semibold">Agregar</span>. El logo aparecerá como icono en tu pantalla principal.
                </Step>
              </>
            ) : (
              <>
                <Step n={1}>
                  Abre el sitio en <span className="font-semibold">Chrome</span> y toca el menú
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FCF8F7] border border-[#3B0E1A]/20">
                    <MoreVertical size={11} className="text-[#3B0E1A]" />
                    <span className="text-[0.7rem] font-medium">Más</span>
                  </span>
                  arriba a la derecha
                </Step>
                <Step n={2}>
                  Toca
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FCF8F7] border border-[#3B0E1A]/20 text-[0.74rem] font-medium">
                    Instalar app
                  </span>
                  o <span className="font-semibold">Agregar a pantalla de inicio</span>
                </Step>
                <Step n={3}>
                  Confirma. VARRE24 queda como acceso directo, con el logo como icono.
                </Step>
              </>
            )}
          </ol>
          </div>
        </details>
      )}
    </AuthLayout>
  );
};

export default Login;
