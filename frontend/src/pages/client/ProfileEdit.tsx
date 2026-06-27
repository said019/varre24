import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProfilePhotoUpload } from "@/components/ProfilePhotoUpload";
import type { UpdateProfileData } from "@/types/auth";

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  phone: z.string().regex(/^\+52[0-9]{10}$/, "Formato: +521234567890").or(z.literal("")),
  gender: z.enum(["female", "male", "other", ""]).optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const ProfileEdit = () => {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (user) {
      reset({
        displayName: user.displayName ?? user.display_name ?? "",
        phone: user.phone ?? "",
        gender: (user as any).gender ?? "",
        dateOfBirth: user.dateOfBirth ?? user.date_of_birth ?? "",
        emergencyContactName: user.emergencyContactName ?? user.emergency_contact_name ?? "",
        emergencyContactPhone: user.emergencyContactPhone ?? user.emergency_contact_phone ?? "",
        healthNotes: user.healthNotes ?? user.health_notes ?? "",
      });
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: (data: UpdateProfileData) => api.put(`/users/${user?.id}`, data),
    onSuccess: (res) => {
      const updated = res.data?.data ?? res.data;
      if (updated?.user) updateUser(updated.user);
      toast({ title: "Perfil actualizado" });
      navigate("/app/profile");
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate({
      displayName: data.displayName,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      emergencyContactName: data.emergencyContactName || undefined,
      emergencyContactPhone: data.emergencyContactPhone || undefined,
      healthNotes: data.healthNotes || undefined,
    } as any);
  };

  const inputCls =
    "rounded-xl border-[#E8D7D6] bg-[#FCF8F7] font-alilato text-[#1A060B] placeholder:text-[#9C8A8B]/60 focus:border-[#3B0E1A] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors";
  const labelCls = "font-alilato text-[0.66rem] uppercase tracking-[0.18em] text-[#9C8A8B]";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-lg px-1 py-4 sm:py-8 space-y-10">

          {/* ── Encabezado editorial ── */}
          <section>
            <button
              type="button"
              onClick={() => navigate("/app/profile")}
              className="flex items-center gap-1.5 font-alilato text-[0.7rem] uppercase tracking-[0.18em] text-[#9C8A8B] transition-colors hover:text-[#3B0E1A]"
            >
              <ArrowLeft size={14} strokeWidth={1.75} /> Perfil
            </button>
            <h1 className="mt-4 font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#1A060B]">
              Editar perfil
            </h1>
          </section>

          {user?.id && (
            <div className="flex justify-center">
              <ProfilePhotoUpload
                userId={user.id}
                currentPhotoUrl={(user as any).photoUrl ?? (user as any).photo_url ?? null}
                displayName={user.displayName ?? user.display_name ?? user.email ?? ""}
                size="lg"
              />
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {[
              { name: "displayName" as const, label: "Nombre completo" },
              { name: "phone" as const, label: "Teléfono", placeholder: "+521234567890" },
              { name: "dateOfBirth" as const, label: "Fecha de nacimiento", type: "date" },
              { name: "emergencyContactName" as const, label: "Contacto de emergencia" },
              { name: "emergencyContactPhone" as const, label: "Teléfono de emergencia" },
            ].map(({ name, label, type, placeholder }) => (
              <div key={name} className="space-y-2">
                <Label className={labelCls}>{label}</Label>
                <Input
                  type={type ?? "text"}
                  placeholder={placeholder}
                  {...register(name)}
                  className={inputCls}
                />
                {errors[name] && <p className="font-alilato text-xs text-[#9B5B53]">{errors[name]?.message}</p>}
              </div>
            ))}

            {/* Gender select */}
            <div className="space-y-2">
              <Label className={labelCls}>Sexo</Label>
              <select
                {...register("gender")}
                className="w-full rounded-xl border border-[#E8D7D6] bg-[#FCF8F7] px-3 py-2.5 font-alilato text-sm text-[#1A060B] transition-colors focus:border-[#3B0E1A] focus:outline-none"
              >
                <option value="">Selecciona…</option>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
                <option value="other">Otro</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className={labelCls}>Notas de salud</Label>
              <Textarea
                placeholder="Alergias, condiciones médicas relevantes…"
                {...register("healthNotes")}
                className={inputCls}
              />
            </div>
            <Button
              type="submit"
              className="press w-full rounded-full bg-[#3B0E1A] py-6 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] hover:bg-[#320C16]"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
              Guardar cambios
            </Button>
          </form>
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default ProfileEdit;
