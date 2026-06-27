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
};

const ProfileRow = ({ icon: Icon, label, description, to, onClick, danger }: RowProps) => {
  const inner = (
    <>
      <span className="flex items-center gap-4">
        <Icon
          size={18}
          strokeWidth={1.6}
          className={danger ? "text-[#9B5B53]" : "text-[#5B4A3E]"}
        />
        <span className="block">
          <span className={`block font-alilato text-sm font-medium ${danger ? "text-[#9B5B53]" : "text-[#2A211B]"}`}>
            {label}
          </span>
          {description && (
            <span className="mt-0.5 block font-alilato text-xs text-[#5B4A3E]/60">{description}</span>
          )}
        </span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-[#8A8077]/45 transition-transform group-hover:translate-x-0.5" />
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
            <p className="font-alilato text-[0.68rem] uppercase tracking-[0.28em] text-[#8A8077]">
              Mi cuenta
            </p>
            <div className="mt-5 flex items-center gap-5">
              {/* Avatar flat */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#5B4A3E] font-bebas text-xl font-light tracking-wide text-[#F6F2EB]">
                {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-bebas text-[clamp(1.7rem,4vw,2.4rem)] font-light leading-[1.1] tracking-[0.01em] text-[#2A211B]">
                  {name}
                </h1>
                <p className="mt-1 truncate font-alilato text-sm text-[#5B4A3E]/70">{user?.email}</p>
                {user?.phone && (
                  <p className="truncate font-alilato text-sm text-[#5B4A3E]/70">{user.phone}</p>
                )}
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E4DACE] px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5B4A3E]" />
                  <span className="font-alilato text-[0.62rem] uppercase tracking-[0.18em] text-[#8A8077]">
                    {roleLabel}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* ── Ajustes ── */}
          <section>
            <p className="mb-2 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#8A8077]">
              Ajustes
            </p>
            <div className="divide-y divide-[#E4DACE] border-y border-[#E4DACE]">
              <ProfileRow
                to="/app/profile/edit"
                icon={User}
                label="Editar perfil"
                description="Nombre, teléfono, foto y más"
              />
              <ProfileRow
                to="/app/profile/preferences"
                icon={Bell}
                label="Preferencias"
                description="Notificaciones y comunicaciones"
              />
            </div>
          </section>

          {/* ── Sesión ── */}
          <section>
            <p className="mb-2 font-alilato text-[0.7rem] uppercase tracking-[0.24em] text-[#8A8077]">
              Sesión
            </p>
            <div className="border-y border-[#E4DACE]">
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
