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
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#7C0116] text-[#FFF1F3] text-[0.65rem] font-semibold flex items-center justify-center mt-0.5 tabular">
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
      <p className="font-alilato text-[0.72rem] tracking-[0.18em] uppercase text-[#7C0116] font-semibold mb-3 flex items-center gap-2">
        <span className="w-5 h-[1px] bg-[#7C0116] inline-block" />
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
            className="font-alilato bg-[#FFF7F8] border border-[#F3CCD4] rounded-xl px-4 py-3.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#7C0116] transition-all"
          />
          {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
        </div>

        {/* password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
            <Link to="/auth/forgot-password" className="text-xs text-[#7C0116] hover:text-[#7C0116]/80 transition-colors no-underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
              className="font-alilato w-full bg-[#FFF7F8] border border-[#F3CCD4] rounded-xl px-4 py-3.5 pr-12 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#7C0116] transition-all"
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
          className="press mt-2 bg-[#7C0116] text-[#FFF1F3] py-4 rounded-full text-sm font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_rgba(124,1,22,0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
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

      {/* divider */}
      <div className="flex items-center gap-4 my-8">
        <div className="flex-1 h-[1px] bg-border" />
        <span className="text-xs text-muted-foreground font-alilato">¿Primera vez?</span>
        <div className="flex-1 h-[1px] bg-border" />
      </div>

      {/* register CTA */}
      <Link
        to="/auth/register"
        className="press flex items-center justify-center gap-2 w-full py-4 rounded-full border border-[#F3CCD4] text-[#7C0116] text-sm font-semibold tracking-[0.12em] uppercase hover:border-[#7C0116] hover:bg-[#FFF7F8] transition-all no-underline"
      >
        Crear cuenta nueva
      </Link>

      {/* Recuperación: nueva sesión limpia sin cerrar la página ni reinstalar.
          Para alumnas atoradas (sesión vencida, pantallas que rebotan, o app
          con versión vieja en caché). */}
      <div className="mt-8 rounded-xl border border-[#F3CCD4] bg-[#FFF7F8] p-3.5 text-center">
        <p className="text-[0.72rem] text-muted-foreground leading-snug mb-2 font-alilato">
          ¿La app se queda cargando, rebota entre pantallas o no te deja entrar?
        </p>
        <button
          type="button"
          onClick={async () => {
            setResetting(true);
            try { await hardResetSession(); }
            catch { setResetting(false); }
          }}
          disabled={resetting}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#7C0116] hover:text-[#7C0116]/80 transition-colors disabled:opacity-60"
        >
          {resetting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {resetting ? "Reiniciando…" : "Iniciar sesión nueva (reiniciar app)"}
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground/50 mt-6 font-alilato">
        © {new Date().getFullYear()} VARRE24 · Nápoles, CDMX
      </p>

      {/* PWA Install Card — siempre visible salvo si la app ya corre standalone */}
      {!isStandalone && (
        <div className="mt-7 rounded-2xl border border-[#7C0116]/25 bg-[#FFE4E8] p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#670626] shadow-soft p-2 flex items-center justify-center shrink-0">
              <img src="/brand/varre24-logo-cream.svg" alt="" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.66rem] tracking-[0.22em] uppercase text-[#7C0116] font-semibold mb-1">
                Acceso rápido
              </p>
              <h3 className="font-bebas text-[1.35rem] leading-none text-[#2B0911] tracking-tight">
                Instala VARRE24
                <span className="font-editorial italic font-light text-[0.85rem] text-[#7C0116] normal-case ml-1.5 tracking-normal">
                  en tu teléfono.
                </span>
              </h3>
            </div>
          </div>

          {/* Tabs iOS / Android */}
          <div className="inline-flex p-0.5 bg-[#FFF7F8] rounded-full border border-[#7C0116]/15 mb-4">
            {(["android", "ios"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInstallPlatform(p)}
                className={`press px-4 py-1.5 rounded-full text-[0.7rem] tracking-[0.14em] uppercase font-semibold transition-colors ${
                  installPlatform === p
                    ? "bg-[#7C0116] text-[#FFF1F3] shadow-soft"
                    : "text-[#670626] hover:text-[#2B0911]"
                }`}
              >
                <Smartphone size={11} className="inline -mt-0.5 mr-1.5" />
                {p === "android" ? "Android" : "iPhone"}
              </button>
            ))}
          </div>

          {/* Pasos */}
          <ol className="space-y-2.5 text-[0.82rem] text-[#2B0911]/85 leading-[1.55] font-alilato">
            {installPlatform === "ios" ? (
              <>
                <Step n={1}>
                  Abre el sitio en <span className="font-semibold">Safari</span> y toca el botón
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FFF7F8] border border-[#7C0116]/20 text-[#7C0116]">
                    <Share size={11} />
                    <span className="text-[0.7rem] font-medium text-[#2B0911]">Compartir</span>
                  </span>
                </Step>
                <Step n={2}>
                  Desliza y elige
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FFF7F8] border border-[#7C0116]/20 text-[0.74rem] font-medium">
                    <Plus size={11} className="text-[#7C0116]" /> Agregar a pantalla de inicio
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
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FFF7F8] border border-[#7C0116]/20">
                    <MoreVertical size={11} className="text-[#7C0116]" />
                    <span className="text-[0.7rem] font-medium">Más</span>
                  </span>
                  arriba a la derecha
                </Step>
                <Step n={2}>
                  Toca
                  <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-[#FFF7F8] border border-[#7C0116]/20 text-[0.74rem] font-medium">
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

          <p className="mt-4 pt-3 border-t border-[#7C0116]/15 text-[0.7rem] text-[#670626] leading-[1.5] font-alilato">
            Una vez instalada, abre la app desde tu pantalla de inicio para entrar más rápido y recibir notificaciones de tus clases.
          </p>
        </div>
      )}
    </AuthLayout>
  );
};

export default Login;
