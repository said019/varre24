import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";

const ProfilePreferences = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prefs, setPrefs] = useState({
    receiveReminders: user?.receiveReminders ?? user?.receive_reminders ?? true,
    receivePromotions: user?.receivePromotions ?? user?.receive_promotions ?? false,
    receiveWeeklySummary: user?.receiveWeeklySummary ?? user?.receive_weekly_summary ?? false,
  });

  const mutation = useMutation({
    mutationFn: () => api.put(`/users/${user?.id}`, prefs),
    onSuccess: (res) => {
      const updated = res.data?.data ?? res.data;
      if (updated?.user) updateUser(updated.user);
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Preferencias guardadas" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const items = [
    { key: "receiveReminders" as const, label: "Recordatorios de clase", desc: "Recibe un recordatorio antes de cada clase" },
    { key: "receivePromotions" as const, label: "Promociones y ofertas", desc: "Entérate de descuentos y eventos especiales" },
    { key: "receiveWeeklySummary" as const, label: "Resumen semanal", desc: "Un resumen de tu actividad cada semana" },
  ];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-lg px-1 py-4 sm:py-8 space-y-10">

          {/* ── Encabezado editorial ── */}
          <section>
            <button
              type="button"
              onClick={() => navigate("/app/profile")}
              className="flex items-center gap-1.5 font-alilato text-[0.7rem] uppercase tracking-[0.18em] text-[#8A8077] transition-colors hover:text-[#5B4A3E]"
            >
              <ArrowLeft size={14} strokeWidth={1.75} /> Perfil
            </button>
            <h1 className="mt-4 font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#2A211B]">
              Preferencias
            </h1>
          </section>

          {/* ── Notificaciones ── */}
          <section>
            <p className="mb-2 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#8A8077]">
              Notificaciones
            </p>
            <div className="divide-y divide-[#E4DACE] border-y border-[#E4DACE]">
              {items.map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4 py-4">
                  <div className="space-y-0.5">
                    <Label className="font-alilato text-sm font-medium text-[#2A211B]">{label}</Label>
                    <p className="font-alilato text-xs text-[#5B4A3E]/60">{desc}</p>
                  </div>
                  <Switch
                    checked={prefs[key]}
                    onCheckedChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
                  />
                </div>
              ))}
            </div>
            <Button
              className="press mt-6 w-full rounded-full bg-[#5B4A3E] py-6 font-alilato text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#F6F2EB] hover:bg-[#4A3D32]"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Guardando…" : "Guardar preferencias"}
            </Button>
          </section>

          {/* ── Cambiar contraseña ── */}
          <ChangePasswordCard />
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default ProfilePreferences;
