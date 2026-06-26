import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowRight, Share, Plus, MoreVertical, Smartphone, RefreshCw } from "lucide-react";
import { hardResetSession } from "@/lib/session";
import pilatesRoomLogo from "@/assets/pilates-room-logo.png";
import authPhotoPanel from "@/assets/pilates-room-images/index-hero-coaches-mobile.jpeg";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Requerido"),
});
type FormValues = { email: string; password: string };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#7C0116] text-white text-[0.65rem] font-semibold flex items-center justify-center mt-0.5 tabular">
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

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT PANEL — foto del estudio ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#2B0911]">
        <img
          src={authPhotoPanel}
          alt="Equipo de instructoras de VARRE24"
          className="absolute inset-0 h-full w-full object-cover object-[50%_42%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(74,51,41,0.38)_0%,rgba(74,51,41,0.16)_32%,rgba(74,51,41,0.72)_74%,rgba(74,51,41,0.94)_100%)]" />

        {/* glow ambiental */}
        <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle,#E7C9CF_0%,transparent_70%)] opacity-20 animate-mesh pointer-events-none" />

        {/* content sobre la foto */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* logo */}
          <Link to="/" className="block">
            <img src={pilatesRoomLogo} alt="VARRE24" className="h-20 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
          </Link>

          {/* quote */}
          <div>
            <div className="inline-flex items-center gap-2 border border-white/40 px-4 py-[7px] rounded-full text-xs tracking-[0.12em] uppercase text-white/90 mb-6">
              <span className="w-[6px] h-[6px] rounded-full bg-white animate-pulse" />
              Nápoles · Benito Juárez, CDMX
            </div>
            <h2 className="font-bebas text-[clamp(3rem,5vw,5.5rem)] leading-[0.92] text-white mb-5 tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.4)]">
              MOVIMIENTO
              <span className="block font-editorial italic font-light text-[#F3CCD4] normal-case">
                con propósito.
              </span>
            </h2>
            <p className="text-white/85 text-[0.92rem] leading-[1.7] max-w-[360px] font-alilato">
              Un espacio donde otros roles se quedan afuera. Barre &amp; Pilates Mat en grupos de 7, con un cierre de relajación que cuida tu regreso al día.
            </p>
            {/* stats */}
            <div className="flex gap-8 mt-9 tabular">
              {[["07", "Por clase"], ["60", "Min · sesión"], ["29", "Clases / semana"]].map(([n, l]) => (
                <div key={l}>
                  <div className="font-bebas text-[1.85rem] leading-none text-white tracking-wide">{n}</div>
                  <div className="text-[0.7rem] text-white/70 uppercase tracking-[0.18em] leading-tight mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative overflow-hidden">
        {/* ambient glow */}
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[120px] bg-[radial-gradient(circle,hsl(var(--primary)/0.12)_0%,transparent_70%)] -top-[100px] -right-[100px] pointer-events-none" />
        <div className="absolute w-[300px] h-[300px] rounded-full blur-[80px] bg-[radial-gradient(circle,hsl(var(--primary)/0.08)_0%,transparent_70%)] bottom-[50px] left-[50px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-[400px]">

          {/* Mobile logo — prominent for PWA home screen identity */}
          <Link to="/" className="lg:hidden flex flex-col items-center mb-10">
            <img src={pilatesRoomLogo} alt="VARRE24" className="h-20 w-auto drop-shadow-sm" />
            <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mt-2">Barre &amp; Pilates · CDMX</span>
          </Link>

          {/* heading */}
          <div className="mb-10">
            <p className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-3 flex items-center gap-2">
              <span className="w-5 h-[1px] bg-primary inline-block" />
              Bienvenida de vuelta
            </p>
            <h1 className="font-bebas text-[3.5rem] leading-none text-foreground">
              INICIAR<br />
              <span className="text-primary">SESIÓN</span>
            </h1>
          </div>

          {/* error global */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl mb-6">
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
                className="bg-secondary border border-border rounded-xl px-4 py-3.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:bg-secondary/80 transition-all"
              />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </div>

            {/* password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
                <Link to="/auth/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors no-underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3.5 pr-12 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:bg-secondary/80 transition-all"
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
              className="mt-2 relative overflow-hidden bg-primary text-primary-foreground py-4 rounded-xl text-sm font-medium tracking-wider uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_hsl(var(--primary)/0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
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
            <span className="text-xs text-muted-foreground">¿Primera vez?</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          {/* register CTA */}
          <Link
            to="/auth/register"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-border text-foreground text-sm font-medium tracking-wider uppercase hover:border-primary hover:text-primary transition-all no-underline"
          >
            Crear cuenta nueva
          </Link>

          {/* Recuperación: nueva sesión limpia sin cerrar la página ni reinstalar.
              Para alumnas atoradas (sesión vencida, pantallas que rebotan, o app
              con versión vieja en caché). */}
          <div className="mt-8 rounded-xl border border-border/70 bg-secondary/40 p-3.5 text-center">
            <p className="text-[0.72rem] text-muted-foreground leading-snug mb-2">
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
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-60"
            >
              {resetting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {resetting ? "Reiniciando…" : "Iniciar sesión nueva (reiniciar app)"}
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground/50 mt-6">
            © {new Date().getFullYear()} VARRE24 · Nápoles, CDMX
          </p>

          {/* PWA Install Card — siempre visible salvo si la app ya corre standalone */}
          {!isStandalone && (
            <div className="mt-7 rounded-2xl border border-[#7C0116]/25 bg-mesh-warm ring-spotlight p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-white shadow-soft p-1.5 flex items-center justify-center shrink-0">
                  <img src={pilatesRoomLogo} alt="" className="w-full h-full object-contain" />
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
              <div className="inline-flex p-0.5 bg-white/60 rounded-full border border-[#7C0116]/15 mb-4">
                {(["android", "ios"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInstallPlatform(p)}
                    className={`press px-4 py-1.5 rounded-full text-[0.7rem] tracking-[0.14em] uppercase font-semibold transition-colors ${
                      installPlatform === p
                        ? "bg-[#7C0116] text-white shadow-soft"
                        : "text-[#5C0110] hover:text-[#2B0911]"
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
                      <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-white border border-[#7C0116]/20 text-[#007AFF]">
                        <Share size={11} />
                        <span className="text-[0.7rem] font-medium text-[#2B0911]">Compartir</span>
                      </span>
                    </Step>
                    <Step n={2}>
                      Desliza y elige
                      <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-white border border-[#7C0116]/20 text-[0.74rem] font-medium">
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
                      <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-white border border-[#7C0116]/20">
                        <MoreVertical size={11} className="text-[#7C0116]" />
                        <span className="text-[0.7rem] font-medium">Más</span>
                      </span>
                      arriba a la derecha
                    </Step>
                    <Step n={2}>
                      Toca
                      <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-white border border-[#7C0116]/20 text-[0.74rem] font-medium">
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

              <p className="mt-4 pt-3 border-t border-[#7C0116]/15 text-[0.7rem] text-[#5C0110] leading-[1.5] font-alilato">
                Una vez instalada, abre la app desde tu pantalla de inicio para entrar más rápido y recibir notificaciones de tus clases.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
