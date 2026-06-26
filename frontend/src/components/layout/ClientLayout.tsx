import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  LayoutDashboard, Calendar, ClipboardList, CreditCard,
  User, Bell, LogOut, Menu, X, Settings, ChevronRight,
  Sparkles, Gift,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import pilatesRoomLogo from "@/assets/pilates-room-logo.png";

/* ── Navigation groups ─────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Principal",
    labelColor: "#836A5D",
    items: [
      { to: "/app", label: "Inicio", icon: LayoutDashboard, activeColor: "#836A5D" },
      { to: "/app/classes", label: "Reservar clase", icon: Calendar, activeColor: "#836A5D" },
      { to: "/app/bookings", label: "Mis reservas", icon: ClipboardList, activeColor: "#C8B79E" },
      { to: "/app/orders", label: "Mis órdenes", icon: CreditCard, activeColor: "#836A5D" },
      { to: "/app/referrals", label: "Invita y gana 10%", icon: Gift, activeColor: "#C8B79E" },
    ],
  },
];

/* ── Single nav item ───────────────────────────────────────────────── */
const NavItem = ({
  to, label, icon: Icon, onClick, collapsed, activeColor = "#836A5D",
}: {
  to: string; label: string; icon: LucideIcon; onClick?: () => void; collapsed?: boolean; activeColor?: string;
}) => {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== "/app" && pathname.startsWith(to));

  return (
    <Link
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl border px-3 py-3 text-[0.84rem] font-semibold transition-all duration-200 no-underline active:scale-[0.98]",
        active
          ? "border-[#faf3ea]/20 bg-[#836A5D] text-[#FAF3EA] shadow-[0_18px_34px_-24px_rgba(47,40,35,0.75)]"
          : "border-transparent text-[#715B50]/62 hover:border-[#836A5D]/12 hover:bg-[#836A5D]/[0.07] hover:text-[#715B50]",
        collapsed && "justify-center px-2"
      )}
    >
      {/* Icon */}
      <span className={cn("flex-shrink-0 transition-all", active ? "text-[#FAF3EA]" : "group-hover:text-[#836A5D]")}>
        <Icon size={17} />
      </span>

      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </Link>
  );
};

/* ── Main layout ───────────────────────────────────────────────────── */
const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  const initials = (user?.displayName ?? user?.display_name)
    ? (user?.displayName ?? user?.display_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : "U";

  const firstName = (user?.displayName ?? user?.display_name)?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "Tú";

  /* ── mobile bottom nav items ── */
  const BOTTOM_NAV = [
    { to: "/app", icon: LayoutDashboard, label: "Inicio", color: "#836A5D" },
    { to: "/app/classes", icon: Calendar, label: "Clases", color: "#836A5D" },
    { to: "/app/bookings", icon: ClipboardList, label: "Reservas", color: "#C8B79E" },
    { to: "/app/profile", icon: User, label: "Perfil", color: "#836A5D" },
  ];

  return (
    <div className="client-shell flex min-h-[100dvh] bg-[#FFF8F0]">

      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#836A5D]/25 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── SIDEBAR ────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col transition-transform duration-300 lg:static lg:translate-x-0",
        "border-r border-[#836A5D]/12 bg-[#F1E3D2]/95 shadow-[18px_0_60px_-46px_rgba(84,67,49,0.6)] backdrop-blur-xl",
        open ? "translate-x-0" : "-translate-x-full"
      )}>

        {/* Ambient top glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-gradient-to-b from-white/50 to-transparent" />

        {/* ── Logo / Brand ── */}
        <div className="relative flex h-24 items-center justify-between px-6 border-b border-[#836A5D]/12">
          <Link to="/" className="flex items-center no-underline">
            <img src={pilatesRoomLogo} alt="Pilates Room" className="h-16 w-auto" />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden rounded-lg p-1.5 text-[#836A5D] hover:text-[#2d2d2d] hover:bg-[#836A5D]/10 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── User card ── */}
        <Link
          to="/app/profile"
          onClick={() => setOpen(false)}
          className={cn(
            "relative mx-3 mt-4 mb-2 flex items-center gap-3 rounded-2xl p-3.5 no-underline transition-all duration-200",
            "bg-white/48 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_16px_36px_-30px_rgba(84,67,49,0.62)]",
            "border border-[#C8B79E]/[0.20] hover:border-[#836A5D]/30 hover:bg-white/62",
            pathname.startsWith("/app/profile") && "border-[#836A5D]/30"
          )}
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white",
              "bg-[#836A5D] shadow-md shadow-[#836A5D]/20"
            )}>
              {(user?.photoUrl ?? user?.photo_url)
                ? <img src={(user?.photoUrl ?? user?.photo_url)!} className="h-11 w-11 rounded-2xl object-cover" alt="" />
                : initials}
            </div>
            {/* Online dot */}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#FAF3EA]" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.83rem] font-semibold text-[#2d2d2d] leading-tight">
              {firstName}
            </p>
            <p className="truncate text-[0.72rem] text-[#2d2d2d]/55 leading-tight mt-0.5">
              {user?.email}
            </p>
          </div>

          <ChevronRight size={14} className="flex-shrink-0 text-[#836A5D]/50" />
        </Link>

        {/* ── Nav groups ── */}
        <nav className="flex-1 overflow-y-auto px-3 pb-2 space-y-5 mt-4
          [&::-webkit-scrollbar]:w-[3px]
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-[#836A5D]/15
          [&::-webkit-scrollbar-thumb:hover]:bg-[#836A5D]/40">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p
                className="px-3 mb-2 text-[0.66rem] font-bold uppercase tracking-[0.18em]"
                style={{ color: `${group.labelColor}70` }}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    onClick={() => setOpen(false)}
                    activeColor={item.activeColor}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Bottom actions ── */}
        <div className="border-t border-[#836A5D]/12 p-3 space-y-1">
          <Link
            to="/app/checkout"
            onClick={() => setOpen(false)}
            className="mb-2 flex items-center gap-3 rounded-2xl border border-[#836A5D]/12 bg-[#836A5D] px-3 py-3 text-[0.82rem] font-semibold text-[#FFF8F0] shadow-[0_18px_34px_-26px_rgba(47,40,35,0.9)] transition-all hover:bg-[#6C5147]"
          >
            <Sparkles size={17} />
            <span>Adquirir membresía</span>
          </Link>
          <Link
            to="/app/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold text-[#2d2d2d]/55 hover:bg-[#836A5D]/[0.06] hover:text-[#2d2d2d] transition-all"
          >
            <Bell size={17} />
            <span>Notificaciones</span>
          </Link>
          <Link
            to="/app/profile/preferences"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold text-[#2d2d2d]/55 hover:bg-[#836A5D]/[0.06] hover:text-[#2d2d2d] transition-all"
          >
            <Settings size={17} />
            <span>Configuración</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-semibold text-[#2d2d2d]/55 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={17} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#836A5D]/15 bg-[#FAF3EA]/95 backdrop-blur-md px-4 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl p-2 text-[#836A5D] hover:text-[#2d2d2d] hover:bg-[#836A5D]/10 transition-colors"
          >
            <Menu size={20} />
          </button>

          <Link to="/">
            <img src={pilatesRoomLogo} alt="Pilates Room" className="h-12 w-auto" />
          </Link>

          <Link to="/app/notifications" className="rounded-xl p-2 text-[#836A5D] hover:text-[#2d2d2d] hover:bg-[#836A5D]/10 transition-colors">
            <Bell size={20} />
          </Link>
        </header>

        {/* Page content */}
        <main className="relative flex-1 overflow-y-auto p-4 pb-28 lg:p-8 lg:pb-8">
          {children}
        </main>

        {/* ── Mobile bottom navigation ── */}
        <nav className="fixed bottom-3 inset-x-3 z-30 flex rounded-2xl lg:hidden
          bg-[#FAF3EA]/96 backdrop-blur-xl
          shadow-[0_8px_32px_-8px_rgba(84,67,49,0.25),0_2px_8px_rgba(84,67,49,0.10)]
          border border-[#836A5D]/10">
          {BOTTOM_NAV.map(({ to, icon: Icon, label, color }) => {
            const active = pathname === to || (to !== "/app" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className="flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-all"
              >
                <span className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
                  active ? "bg-[#836A5D] text-[#FAF3EA] shadow-sm" : "text-[#715B50]/45"
                )}>
                  <Icon size={18} />
                </span>
                <span className={cn(
                  "text-[0.60rem] font-medium leading-none",
                  active ? "text-[#836A5D] font-semibold" : "text-[#715B50]/40"
                )}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

      </div>
    </div>
  );
};

export default ClientLayout;
