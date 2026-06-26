import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { Heart, Search, X } from "lucide-react";

interface ClientOption {
  id: string;
  displayName: string;
  email?: string;
  phone?: string | null;
}

/**
 * Botón + diálogo para regalar clases de cortesía (gratis) a una alumna.
 * Reutilizable: Admin → Membresías, Clases (calendario) y Reservas.
 *
 * Crea una membresía sin costo (no genera orden → no afecta ingresos). La
 * alumna la reserva como cualquier otra desde la app.
 */
export function CourtesyButton({
  size = "sm",
  variant = "outline",
  className = "border-[#C8B79E]/50 text-[#836A5D] hover:bg-[#C8B79E]/10",
  label = "Clases de cortesía",
}: {
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "outline" | "default" | "ghost" | "secondary";
  className?: string;
  label?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<ClientOption | null>(null);
  const [search, setSearch] = useState("");
  const [classes, setClasses] = useState("1");
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const debouncedSearch = useDebounce(search, 250);

  const { data: usersData, isFetching } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["courtesy-users-search", debouncedSearch],
    enabled: open && !user,
    queryFn: async () =>
      (await api.get(`/users?role=client${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""}`)).data,
  });
  const options = Array.isArray(usersData?.data) ? usersData.data : [];

  const reset = () => {
    setUser(null);
    setSearch("");
    setClasses("1");
    setDays("30");
    setNote("");
  };

  const grant = useMutation({
    mutationFn: () =>
      api.post("/admin/memberships/courtesy", {
        userId: user?.id,
        classes: Number(classes) || 1,
        days: Number(days) || 30,
        note: note.trim() || undefined,
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["memberships"] });
      qc.invalidateQueries({ queryKey: ["client-memberships"] });
      toast({ title: res?.data?.message ?? "Clases de cortesía otorgadas" });
      setOpen(false);
      reset();
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "No se pudieron otorgar las clases", variant: "destructive" });
    },
  });

  const n = Number(classes) || 0;

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Heart size={14} className="mr-1" />{label}
      </Button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart size={16} className="text-[#C8B79E]" /> Clases de cortesía
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Regala clases gratis a una alumna. Se crea una membresía sin costo (no afecta ingresos) y la alumna puede reservarlas desde la app.
            </p>

            <div className="space-y-1">
              <Label>Alumna</Label>
              {user ? (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground">{user.email ?? "—"}{user.phone ? ` · ${user.phone}` : ""}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => { setUser(null); setSearch(""); }}>
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2d2d2d]/30" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                      placeholder="Buscar por nombre, email o teléfono"
                    />
                  </div>
                  <div className="max-h-40 overflow-auto rounded-md border border-border">
                    {isFetching ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
                    ) : options.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    ) : (
                      options.map((u) => (
                        <button
                          type="button"
                          key={u.id}
                          className="w-full px-3 py-2 text-left hover:bg-[#836A5D]/[0.06] border-b last:border-b-0 border-border"
                          onClick={() => { setUser(u); setSearch(u.displayName ?? ""); }}
                        >
                          <p className="text-sm font-medium">{u.displayName}</p>
                          <p className="text-xs text-muted-foreground">{u.email ?? "—"}{u.phone ? ` · ${u.phone}` : ""}</p>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Número de clases</Label>
                <Input type="number" min={1} max={50} value={classes} onChange={(e) => setClasses(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Vigencia (días)</Label>
                <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Nota (opcional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ej. Cumpleaños, recompensa por referir…"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={!user || n < 1 || grant.isPending}
              onClick={() => grant.mutate()}
              className="bg-[#836A5D] hover:bg-[#6C5147] text-white"
            >
              {grant.isPending ? "Otorgando…" : `Regalar ${n} clase${n === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
