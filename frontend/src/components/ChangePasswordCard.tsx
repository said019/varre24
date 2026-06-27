import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2 } from "lucide-react";

/**
 * Tarjeta de "cambiar contraseña" reutilizable: cliente y admin la
 * incrustan en sus pantallas de configuración / preferencias.
 * Llama a POST /api/auth/change-password con currentPassword + newPassword.
 */
export function ChangePasswordCard({ className = "" }: { className?: string }) {
  const { toast } = useToast();
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post("/auth/change-password", {
      currentPassword: current,
      newPassword: next,
    }),
    onSuccess: () => {
      toast({ title: "Contraseña actualizada", description: "Usa la nueva la próxima vez que entres." });
      setCurrent(""); setNext(""); setConfirm("");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || "No se pudo cambiar la contraseña.";
      toast({ title: msg, variant: "destructive" });
    },
  });

  // Reglas mínimas (espejo de isStrongPassword en el server)
  const lengthOK   = next.length >= 8;
  const upperOK    = /[A-Z]/.test(next);
  const numberOK   = /\d/.test(next);
  const distinct   = next.length > 0 && next !== current;
  const matchOK    = next.length > 0 && next === confirm;
  const allOK      = lengthOK && upperOK && numberOK && distinct && matchOK && !!current;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allOK) {
      toast({ title: "Revisa los requisitos de la contraseña", variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border border-[#E8D7D6] bg-[#FCF8F7] p-5 space-y-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        <KeyRound size={15} strokeWidth={1.75} className="text-[#3B0E1A]" />
        <h2 className="font-alilato text-base font-medium text-[#1A060B]">Cambiar contraseña</h2>
      </div>
      <p className="text-xs text-[#320C16]">
        Para tu seguridad necesitas escribir tu contraseña actual antes de definir una nueva.
      </p>

      <div className="space-y-1">
        <Label className="text-xs">Contraseña actual</Label>
        <div className="relative">
          <Input
            type={show1 ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShow1((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3B0E1A]/50 hover:text-[#3B0E1A]"
            tabIndex={-1}
          >
            {show1 ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Contraseña nueva</Label>
        <div className="relative">
          <Input
            type={show2 ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
          />
          <button
            type="button"
            onClick={() => setShow2((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#3B0E1A]/50 hover:text-[#3B0E1A]"
            tabIndex={-1}
          >
            {show2 ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Confirmar contraseña nueva</Label>
        <Input
          type={show2 ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Repite la contraseña"
        />
      </div>

      <ul className="text-[11px] space-y-0.5 pt-1">
        <RequirementItem ok={lengthOK} label="Al menos 8 caracteres" />
        <RequirementItem ok={upperOK}  label="Una letra mayúscula" />
        <RequirementItem ok={numberOK} label="Un número" />
        <RequirementItem ok={distinct} label="Distinta de la actual" />
        <RequirementItem ok={matchOK}  label="Las dos contraseñas coinciden" />
      </ul>

      <Button
        type="submit"
        disabled={!allOK || mutation.isPending}
        className="press w-full rounded-full bg-[#3B0E1A] py-5 font-alilato text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#F3EFE9] hover:bg-[#320C16] disabled:opacity-50"
      >
        {mutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
        {mutation.isPending ? "Actualizando…" : "Actualizar contraseña"}
      </Button>
    </form>
  );
}

function RequirementItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-emerald-700" : "text-[#3B0E1A]/55"}`}>
      <CheckCircle2 size={11} className={ok ? "opacity-100" : "opacity-30"} />
      {label}
    </li>
  );
}

export default ChangePasswordCard;
