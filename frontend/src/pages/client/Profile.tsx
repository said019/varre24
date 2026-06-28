import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { ChevronRight, User, Bell, LogOut } from "lucide-react";

type RowProps = {
  icon: any;
  label: string;
  description?: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  chip?: string;
  ic?: string;
};

const ProfileRow = ({ icon: Icon, label, description, to, onClick, danger, chip = "bg-[#F4E6EA]", ic = "text-[#3B0E1A]" }: RowProps) => {
  const inner = (
    <>
      <span className="flex items-center gap-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-[#9B5B53]/12" : chip}`}>
          <Icon size={16} strokeWidth={1.6} className={danger ? "text-[#9B5B53]" : ic} />
        </span>
        <span className="block">
          <span className={`block font-alilato text-sm font-medium ${danger ? "text-[#9B5B53]" : "text-[#1A060B]"}`}>
            {label}
          </span>
          {description && (
            <span className="mt-0.5 block font-alilato text-xs text-[#3B0E1A]/60">{description}</span>
          )}
        </span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-[#9C8A8B]/45 transition-transform group-hover:translate-x-0.5" />
    </>
  );

  const cls = "group flex w-full items-center justify-between py-4 text-left no-underline";

  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
};

const Profile = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const name = user?.displayName ?? user?.display_name ?? user?.email?.split("@")[0] ?? "Usuario";
  const photo = user?.photoUrl ?? user?.photo_url;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    user?.role === "client"
      ? user?.gender === "male"
        ? "Alumno"
        : user?.gender === "other"
        ? "Alumno/a"
        : "Alumna"
      : user?.role ?? "Cliente";

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto w-full max-w-3xl px-1 py-4 sm:py-8 space-y-12">

          {/* ── Identidad ── */}
          <section>
            <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#9C8A8B]">
              Mi cuenta
            </p>
            <div className="mt-5 flex items-center gap-5">
              {/* Avatar flat */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#3B0E1A] font-bebas text-xl font-light tracking-wide text-[#F3EFE9]">
                {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#1A060B]">
                  {name}
                </h1>
                <p className="mt-1 truncate font-alilato text-sm text-[#3B0E1A]/70">{user?.email}</p>
                {user?.phone && (
                  <p className="truncate font-alilato text-sm text-[#3B0E1A]/70">{user.phone}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F4E6EA] px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C9A5A8]" />
                  <span className="font-alilato text-[0.62rem] uppercase tracking-[0.18em] text-[#8A5A5E]">
                    {roleLabel}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* ── Ajustes ── */}
          <section>
            <p className="mb-2 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#9C8A8B]">
              Ajustes
            </p>
            <div className="divide-y divide-[#E8D7D6] border-y border-[#E8D7D6]">
              <ProfileRow
                to="/app/profile/edit"
                icon={User}
                label="Editar perfil"
                description="Nombre, teléfono, foto y más"
                chip="bg-[#F4E6EA]"
                ic="text-[#3B0E1A]"
              />
              <ProfileRow
                to="/app/profile/preferences"
                icon={Bell}
                label="Preferencias"
                description="Notificaciones y comunicaciones"
                chip="bg-[#C9A5A8]/25"
                ic="text-[#8A5A5E]"
              />
            </div>
          </section>

          {/* ── Sesión ── */}
          <section>
            <p className="mb-2 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#9C8A8B]">
              Sesión
            </p>
            <div className="border-y border-[#E8D7D6]">
              <ProfileRow
                onClick={handleLogout}
                icon={LogOut}
                label="Cerrar sesión"
                description="Salir de tu cuenta"
                danger
              />
            </div>
          </section>

        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Profile;
