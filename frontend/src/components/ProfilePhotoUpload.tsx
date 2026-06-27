import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import { optimizeImage } from "@/lib/imageOptimization";
import { useAuthStore } from "@/stores/authStore";

interface Props {
  userId: string;
  currentPhotoUrl?: string | null;
  displayName?: string;
  onUpdated?: (photoUrl: string) => void;
  size?: "sm" | "md" | "lg";
}

export function ProfilePhotoUpload({
  userId,
  currentPhotoUrl,
  displayName,
  onUpdated,
  size = "md",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();

  const sizeClass = size === "lg" ? "h-32 w-32" : size === "sm" ? "h-16 w-16" : "h-24 w-24";

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const optimized = await optimizeImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.9,
      });
      const formData = new FormData();
      formData.append("photo", optimized, "profile.jpg");
      const { data } = await api.post(`/users/${userId}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const inner = data?.data ?? data;
      return (inner?.photo_url ?? inner?.photoUrl) as string;
    },
    onSuccess: (photoUrl) => {
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      if (user && user.id === userId) {
        updateUser({ ...user, photoUrl, photo_url: photoUrl } as any);
      }
      onUpdated?.(photoUrl);
      toast({ title: "Foto actualizada" });
    },
    onError: (err: any) => {
      setPreview(null);
      toast({
        variant: "destructive",
        title: "No se pudo subir la foto",
        description: err?.response?.data?.message || err?.response?.data?.error || err.message,
      });
    },
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Selecciona una imagen" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Imagen muy grande (máx 10MB)" });
      return;
    }
    setPreview(URL.createObjectURL(file));
    mutation.mutate(file);
  };

  const photoSrc = preview || currentPhotoUrl || undefined;
  const initials = (displayName || "?")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar className={`${sizeClass} rounded-2xl border border-[#E4DACE]`}>
          <AvatarImage src={photoSrc} alt="Foto de perfil" className="rounded-2xl" />
          <AvatarFallback className="rounded-2xl bg-[#5B4A3E] font-bebas text-2xl font-light tracking-wide text-[#F6F2EB]">
            {initials}
          </AvatarFallback>
        </Avatar>
        {mutation.isPending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[#3A2F26]/55">
            <Loader2 className="h-6 w-6 animate-spin text-[#F6F2EB]" />
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={mutation.isPending}
          className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-[#5B4A3E] text-[#F6F2EB] transition-colors hover:bg-[#4A3D32] active:scale-95 disabled:opacity-50"
          aria-label="Cambiar foto"
        >
          <Camera size={14} strokeWidth={1.75} />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => fileInputRef.current?.click()}
        className="font-alilato text-[0.7rem] uppercase tracking-[0.16em] text-[#8A8077] hover:bg-transparent hover:text-[#5B4A3E]"
      >
        {mutation.isPending ? "Subiendo…" : "Cambiar foto"}
      </Button>
    </div>
  );
}

export default ProfilePhotoUpload;
