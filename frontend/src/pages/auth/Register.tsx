import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { COUNTRIES } from "@/components/ui/phone-input";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AUTH_PHOTOS } from "@/components/landing/photoAssets";
import api from "@/lib/api";
import {
  clampSquareCrop,
  cropImageToSquare,
  DEFAULT_SQUARE_CROP,
  getImageDimensions,
  type ImageDimensions,
  type SquareCrop,
} from "@/lib/imageOptimization";

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

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

const Register = () => {
  const { register: registerUser, isLoading, error, clearError, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dialCode, setDialCode] = useState("52");
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDimensions, setPhotoDimensions] = useState<ImageDimensions | null>(null);
  const [photoCrop, setPhotoCrop] = useState<SquareCrop>(DEFAULT_SQUARE_CROP);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoDragStartRef = useRef<{ x: number; y: number; crop: SquareCrop } | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acceptsTerms: false, acceptsCommunications: false },
  });

  const acceptsTerms = watch("acceptsTerms");
  const acceptsCommunications = watch("acceptsCommunications");

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const updatePhotoCrop = (next: SquareCrop) => {
    if (!photoDimensions) return;
    setPhotoCrop(clampSquareCrop(next, photoDimensions));
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecciona una imagen", description: "Elige una foto en formato de imagen.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Imagen muy grande", description: "Elige una foto de hasta 10 MB.", variant: "destructive" });
      return;
    }

    try {
      const dimensions = await getImageDimensions(file);
      if (!dimensions.width || !dimensions.height) throw new Error("La imagen no tiene dimensiones válidas");
      setProfilePhoto(file);
      setPhotoDimensions(dimensions);
      setPhotoCrop(DEFAULT_SQUARE_CROP);
      setPhotoPreview(URL.createObjectURL(file));
    } catch {
      toast({ title: "No se pudo abrir la foto", description: "Prueba con otra imagen.", variant: "destructive" });
    }
  };

  const removePhoto = () => {
    setProfilePhoto(null);
    setPhotoPreview(null);
    setPhotoDimensions(null);
    setPhotoCrop(DEFAULT_SQUARE_CROP);
  };

  const beginPhotoDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!profilePhoto) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    photoDragStartRef.current = { x: event.clientX, y: event.clientY, crop: photoCrop };
  };

  const movePhoto = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = photoDragStartRef.current;
    if (!dragStart || !photoDimensions) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    updatePhotoCrop({
      ...dragStart.crop,
      x: dragStart.crop.x + (event.clientX - dragStart.x) / bounds.width,
      y: dragStart.crop.y + (event.clientY - dragStart.y) / bounds.height,
    });
  };

  const endPhotoDrag = () => {
    photoDragStartRef.current = null;
  };

  const uploadCroppedProfilePhoto = async () => {
    if (!profilePhoto || !photoDimensions) return;
    const registeredUser = useAuthStore.getState().user;
    if (!registeredUser) return;

    setIsUploadingPhoto(true);
    try {
      const croppedPhoto = await cropImageToSquare(profilePhoto, photoCrop, { size: 720, quality: 0.88 });
      const formData = new FormData();
      formData.append("photo", croppedPhoto);
      const response = await api.post(`/users/${registeredUser.id}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const payload = response.data?.data ?? response.data;
      const photoUrl = payload?.photoUrl ?? payload?.photo_url;
      if (photoUrl) {
        updateUser({ ...registeredUser, photoUrl, photo_url: photoUrl });
      }
    } catch {
      toast({
        title: "Cuenta creada",
        description: "No pudimos guardar la foto. Puedes subirla después desde tu perfil.",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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
      });
      await uploadCroppedProfilePhoto();
      navigate("/app");
    } catch (registrationError: unknown) {
      const serverMessage = typeof registrationError === "object" && registrationError !== null
        ? (registrationError as ApiError).response?.data?.message
        : undefined;
      toast({
        title: "Error al registrarse",
        description: serverMessage ?? error ?? "Inténtalo de nuevo",
        variant: "destructive",
      });
    }
  };

  const photoAspect = photoDimensions ? photoDimensions.width / photoDimensions.height : 1;
  const previewWidth = `${Math.max(1, photoAspect) * 100}%`;
  const previewHeight = `${Math.max(1, 1 / photoAspect) * 100}%`;
  const submitting = isLoading || isUploadingPhoto;

  const heading = (
    <>
      <p className="font-alilato text-[0.72rem] tracking-[0.18em] uppercase text-[#8A5A5E] font-semibold mb-2 flex items-center gap-2">
        <span className="w-5 h-[2px] rounded-full bg-[#FFD6E6] inline-block" />
        Nuevo registro
      </p>
      <h1 className="font-editorial text-[2.4rem] sm:text-[2.7rem] leading-[1.05] tracking-[-0.015em] text-foreground">
        Crear <span className="italic font-light">cuenta</span>
      </h1>
    </>
  );

  return (
    <AuthLayout heading={heading} photo={AUTH_PHOTOS.register}>
      {/* global error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl mb-5 font-alilato">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">

        {/* Foto opcional: el recorte se guarda ya cuadrado para que siempre se vea bien en avatares. */}
        <div className="rounded-[1.35rem] border border-[#E9D9D9] bg-[#FCF8F7] p-3.5">
          <div className="flex items-center gap-3.5">
            <div
              className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-[1.1rem] border border-[#E8D7D6] bg-[#F3EFE9] ${profilePhoto ? "cursor-grab active:cursor-grabbing" : ""}`}
              onPointerDown={beginPhotoDrag}
              onPointerMove={movePhoto}
              onPointerUp={endPhotoDrag}
              onPointerCancel={endPhotoDrag}
              style={{ touchAction: "none" }}
              aria-label={profilePhoto ? "Arrastra para encuadrar la foto" : undefined}
            >
              {photoPreview ? (
                <div
                  className="absolute inset-0 will-change-transform"
                  style={{ transform: `translate3d(${photoCrop.x * 100}%, ${photoCrop.y * 100}%, 0)` }}
                >
                  <img
                    src={photoPreview}
                    alt="Vista previa de tu foto de perfil"
                    className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                    draggable={false}
                    style={{
                      width: previewWidth,
                      height: previewHeight,
                      transform: `translate(-50%, -50%) scale(${photoCrop.zoom})`,
                    }}
                  />
                </div>
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-alilato text-[0.62rem] uppercase tracking-[0.16em] text-[#9C8A8B]">Tu foto</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <label className="block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Foto de perfil <span className="normal-case tracking-normal text-[#9C8A8B]">(opcional)</span>
              </label>
              <p className="mt-1 text-xs leading-relaxed text-[#8A5A5E]">
                Sube una foto clara. Puedes moverla y acercarla para que quede bien encuadrada.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="press rounded-full border border-[#3B0E1A]/20 px-3 py-1.5 font-alilato text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#3B0E1A] transition-colors hover:border-[#3B0E1A] hover:bg-[#FFE4EE]"
                >
                  {profilePhoto ? "Cambiar" : "Subir foto"}
                </button>
                {profilePhoto && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="font-alilato text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#9C8A8B] transition-colors hover:text-[#3B0E1A]"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>

          {profilePhoto && (
            <div className="mt-3 border-t border-[#E9D9D9] pt-3">
              <label htmlFor="profile-photo-zoom" className="flex items-center justify-between text-[0.65rem] font-medium uppercase tracking-[0.14em] text-[#8A5A5E]">
                <span>Acercar foto</span>
                <span>{Math.round(photoCrop.zoom * 100)}%</span>
              </label>
              <input
                id="profile-photo-zoom"
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={photoCrop.zoom}
                onChange={(event) => updatePhotoCrop({ ...photoCrop, zoom: Number(event.target.value) })}
                className="mt-2 h-1.5 w-full cursor-pointer accent-[#3B0E1A]"
              />
              <p className="mt-1.5 text-[0.68rem] text-[#9C8A8B]">Arrastra la foto para ajustar su posición.</p>
            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>

        {/* 2-col: name + phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Nombre</label>
            <input
              placeholder="Tu nombre"
              {...register("displayName")}
              className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
            />
            {errors.displayName && <span className="text-xs text-destructive">{errors.displayName.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Teléfono</label>
            <div className="flex gap-2">
              <select
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-2 py-2 text-foreground text-sm focus:outline-none focus:border-[#3B0E1A] transition-all w-[95px]"
              >
                {COUNTRIES.map((c) => (
                  <option key={`${c.code}-${c.dial}`} value={c.dial}>{c.flag} +{c.dial}</option>
                ))}
              </select>
              <input
                placeholder="4271234567"
                inputMode="numeric"
                {...register("phone")}
                className="font-alilato flex-1 bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
            </div>
            {errors.phone && <span className="text-xs text-destructive">{errors.phone.message}</span>}
          </div>
        </div>

        {/* gender + date of birth — 2 columnas incluso en móvil: son controles
            compactos (select + date), no texto libre, y ahorran una fila entera
            de alto en pantallas chicas */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Sexo</label>
            <select
              {...register("gender")}
              className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 text-foreground text-sm focus:outline-none focus:border-[#3B0E1A] transition-all"
              defaultValue=""
            >
              <option value="" disabled>Selecciona…</option>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
              <option value="other">Otro</option>
            </select>
            {errors.gender && <span className="text-xs text-destructive">{errors.gender.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Fecha de nacimiento</label>
            <input
              type="date"
              {...register("dateOfBirth")}
              max={new Date().toISOString().slice(0, 10)}
              className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 text-foreground text-sm focus:outline-none focus:border-[#3B0E1A] transition-all"
            />
            {errors.dateOfBirth && <span className="text-xs text-destructive">{errors.dateOfBirth.message}</span>}
          </div>
        </div>

        {/* email */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Email</label>
          <input
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            {...register("email")}
            className="font-alilato bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
          />
          {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
        </div>

        {/* 2-col: password + confirm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                {...register("password")}
                className="font-alilato w-full bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 pr-11 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Confirmar</label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                {...register("confirmPassword")}
                className="font-alilato w-full bg-[#FCF8F7] border border-[#E9D9D9] rounded-xl px-4 py-2 pr-11 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#3B0E1A] transition-all"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {errors.confirmPassword && <span className="text-xs text-destructive">{errors.confirmPassword.message}</span>}
          </div>
        </div>

        {/* checkboxes */}
        <div className="flex flex-col gap-1">
          {/* terms */}
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <button
              type="button"
              onClick={() => setValue("acceptsTerms", !acceptsTerms)}
              className={`mt-0.5 w-4 h-4 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${acceptsTerms ? "bg-[#3B0E1A] border-[#3B0E1A]" : "border-[#E9D9D9] group-hover:border-[#3B0E1A]/50"
                }`}
            >
              {acceptsTerms && <Check size={10} className="text-[#F3EFE9]" />}
            </button>
            <span className="text-xs text-muted-foreground leading-snug font-alilato">
              Acepto los{" "}
              <a href="#" className="text-[#3B0E1A] hover:underline">términos y condiciones</a>
            </span>
          </label>
          {errors.acceptsTerms && <span className="text-xs text-destructive -mt-1">{errors.acceptsTerms.message}</span>}

          {/* communications */}
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <button
              type="button"
              onClick={() => setValue("acceptsCommunications", !acceptsCommunications)}
              className={`mt-0.5 w-4 h-4 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${acceptsCommunications ? "bg-[#3B0E1A] border-[#3B0E1A]" : "border-[#E9D9D9] group-hover:border-[#3B0E1A]/50"
                }`}
            >
              {acceptsCommunications && <Check size={10} className="text-[#F3EFE9]" />}
            </button>
            <span className="text-xs text-muted-foreground leading-snug font-alilato">
              Quiero recibir promociones y noticias
            </span>
          </label>
        </div>

        {/* submit */}
        <button
          type="submit"
          disabled={submitting}
          className="press mt-1 bg-[#3B0E1A] text-[#F3EFE9] py-3.5 rounded-full text-sm font-semibold tracking-[0.12em] uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_rgba(59,14,26,0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
        >
          {submitting ? (
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
      <div className="flex items-center gap-4 my-3">
        <div className="flex-1 h-[1px] bg-border" />
        <span className="text-xs text-muted-foreground font-alilato">¿Ya tienes cuenta?</span>
        <div className="flex-1 h-[1px] bg-border" />
      </div>

      <Link
        to="/auth/login"
        className="press flex items-center justify-center gap-2 w-full py-2.5 rounded-full border border-[#E9D9D9] text-[#3B0E1A] text-sm font-semibold tracking-[0.12em] uppercase hover:border-[#3B0E1A] hover:bg-[#FCF8F7] transition-all no-underline"
      >
        Iniciar sesión
      </Link>
    </AuthLayout>
  );
};

export default Register;
