import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { COUNTRIES } from "@/components/ui/phone-input";
import { AuthLayout } from "@/components/auth/AuthLayout";

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 7 && v.length <= 15, "Teléfono inválido"),
  gender: z.enum(["female", "male", "other"]),
  dateOfBirth: z
    .string()
    .min(1, "Fecha requerida")
    .refine((v) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return false;
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 10 && age <= 100;
    }, "Edad debe estar entre 10 y 100 años"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[0-9]/, "Debe incluir un número"),
  confirmPassword: z.string(),
  acceptsTerms: z.boolean().refine((v) => v, "Debes aceptar los términos"),
  acceptsCommunications: z.boolean().default(false),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormValues = {
  displayName: string;
  email: string;
  phone: string;
  gender: "female" | "male" | "other";
  dateOfBirth: string;
  password: string;
  confirmPassword: string;
  acceptsTerms: boolean;
  acceptsCommunications: boolean;
};

const Register = () => {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dialCode, setDialCode] = useState("52");

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acceptsTerms: false, acceptsCommunications: false },
  });

  const acceptsTerms = watch("acceptsTerms");
  const acceptsCommunications = watch("acceptsCommunications");

  const onSubmit = async (data: FormValues) => {
    clearError();
    // normalizar teléfono: quitar no-dígitos y agregar prefijo del país seleccionado
    const rawPhone = data.phone.replace(/\D/g, "");
    const phone = rawPhone.startsWith(dialCode) ? `+${rawPhone}` : `+${dialCode}${rawPhone}`;
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        phone,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        acceptsTerms: data.acceptsTerms,
        acceptsCommunications: data.acceptsCommunications,
      } as any);
      navigate("/app");
    } catch {
      toast({ title: "Error al registrarse", description: error ?? "Inténtalo de nuevo", variant: "destructive" });
    }
  };

  const heading = (
    <>
      <p className="font-alilato text-[0.72rem] tracking-[0.18em] uppercase text-[#3B0E1A] font-semibold mb-3 flex items-center gap-2">
        <span className="w-5 h-[1px] bg-[#3B0E1A] inline-block" />
        Nuevo registro
      </p>
      <h1 className="font-editorial text-[2.4rem] sm:text-[2.7rem] leading-[1.05] tracking-[-0.015em] text-foreground">
        Crear <span className="italic font-light">cuenta</span>
      </h1>
    </>
  );

  return (
    <AuthLayout heading={heading}>
      {/* global error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl mb-5 font-alilato">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

        {/* 2-col: name + phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Nombre</label>
            <input
              placeholder="Tu nombre"
              {...register("displayName")}
              className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
            />
            {errors.displayName && <span className="text-xs text-destructive">{errors.displayName.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Teléfono</label>
            <div className="flex gap-2">
              <select
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-2 py-3 text-foreground text-sm focus:outline-none focus:border-[#3B0E1A] transition-all w-[95px]"
              >
                {COUNTRIES.map((c) => (
                  <option key={`${c.code}-${c.dial}`} value={c.dial}>{c.flag} +{c.dial}</option>
                ))}
              </select>
              <input
                placeholder="4271234567"
                inputMode="numeric"
                {...register("phone")}
                className="font-alilato flex-1 bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
            </div>
            {errors.phone && <span className="text-xs text-destructive">{errors.phone.message}</span>}
          </div>
        </div>

        {/* gender + date of birth */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Sexo</label>
            <select
              {...register("gender")}
              className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:border-[#3B0E1A] transition-all"
              defaultValue=""
            >
              <option value="" disabled>Selecciona…</option>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
              <option value="other">Otro</option>
            </select>
            {errors.gender && <span className="text-xs text-destructive">{errors.gender.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Fecha de nacimiento</label>
            <input
              type="date"
              {...register("dateOfBirth")}
              max={new Date().toISOString().slice(0, 10)}
              className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:border-[#3B0E1A] transition-all"
            />
            {errors.dateOfBirth && <span className="text-xs text-destructive">{errors.dateOfBirth.message}</span>}
          </div>
        </div>

        {/* email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Email</label>
          <input
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            {...register("email")}
            className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
          />
          {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
        </div>

        {/* 2-col: password + confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                {...register("password")}
                className="font-alilato w-full bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 pr-11 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Confirmar</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                {...register("confirmPassword")}
                className="font-alilato w-full bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-3 pr-11 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.confirmPassword && <span className="text-xs text-destructive">{errors.confirmPassword.message}</span>}
          </div>
        </div>

        {/* checkboxes */}
        <div className="flex flex-col gap-3 pt-1">
          {/* terms */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setValue("acceptsTerms", !acceptsTerms)}
              className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${acceptsTerms ? "bg-[#3B0E1A] border-[#3B0E1A]" : "border-[#E9D9D9] group-hover:border-[#3B0E1A]/50"
                }`}
            >
              {acceptsTerms && <Check size={12} className="text-[#F3EFE9]" />}
            </button>
            <span className="text-sm text-muted-foreground leading-snug font-alilato">
              Acepto los{" "}
              <a href="#" className="text-[#3B0E1A] hover:underline">términos y condiciones</a>
            </span>
          </label>
          {errors.acceptsTerms && <span className="text-xs text-destructive -mt-1">{errors.acceptsTerms.message}</span>}

          {/* communications */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setValue("acceptsCommunications", !acceptsCommunications)}
              className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${acceptsCommunications ? "bg-[#3B0E1A] border-[#3B0E1A]" : "border-[#E9D9D9] group-hover:border-[#3B0E1A]/50"
                }`}
            >
              {acceptsCommunications && <Check size={12} className="text-[#F3EFE9]" />}
            </button>
            <span className="text-sm text-muted-foreground leading-snug font-alilato">
              Quiero recibir promociones y noticias
            </span>
          </label>
        </div>

        {/* submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="press mt-3 bg-[#3B0E1A] text-[#F3EFE9] py-4 rounded-full text-sm font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_rgba(59,14,26,0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Crear mi cuenta
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      {/* divider */}
      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-[1px] bg-border" />
        <span className="text-xs text-muted-foreground font-alilato">¿Ya tienes cuenta?</span>
        <div className="flex-1 h-[1px] bg-border" />
      </div>

      <Link
        to="/auth/login"
        className="press flex items-center justify-center gap-2 w-full py-3.5 rounded-full border border-[#E9D9D9] text-[#3B0E1A] text-sm font-semibold tracking-[0.12em] uppercase hover:border-[#3B0E1A] hover:bg-[#FCF8F7] transition-all no-underline"
      >
        Iniciar sesión
      </Link>

      <p className="text-center text-xs text-muted-foreground/50 mt-6 font-alilato">
        © {new Date().getFullYear()} VARRE24 · Nápoles, CDMX
      </p>
    </AuthLayout>
  );
};

export default Register;
