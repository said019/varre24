import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  LayoutDashboard, Calendar, ClipboardList, CreditCard,
  User, Bell, LogOut, Menu, X, Settings, ChevronRight,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Navigation groups ─────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { to: "/app", label: "Inicio", icon: LayoutDashboard },
      { to: "/app/classes", label: "Reservar clase", icon: Calendar },
      { to: "/app/bookings", label: "Mis reservas", icon: ClipboardList },
      { to: "/app/orders", label: "Mis órdenes", icon: CreditCard },
    ],
  },
];

/* Flat list reused for the desktop top nav + mobile drawer. */
const PRIMARY_NAV = NAV_GROUPS[0].items;

/* ── Desktop top-nav link ──────────────────────────────────────────── */
const TopNavLink = ({
  to, label, icon: Icon,
}: { to: string; label: string; icon: LucideIcon }) => {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== "/app" && pathname.startsWith(to));

  return (
    <Link
      to={to}
      data-active={active}
      className={cn(
        "nav-link group relative flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.86rem] no-underline transition-colors duration-200",
        active
          ? "text-[#1A060B] font-medium"
          : "text-[#9C8A8B] font-normal hover:text-[#1A060B]"
      )}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={cn("flex-shrink-0 transition-colors", active ? "text-[#3B0E1A]" : "text-[#9C8A8B] group-hover:text-[#3B0E1A]")}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
};

/* ── Drawer link (mobile slide-over) ───────────────────────────────── */
const DrawerLink = ({
  to, label, icon: Icon, onClick,
}: { to: string; label: string; icon: LucideIcon; onClick?: () => void }) => {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== "/app" && pathname.startsWith(to));

  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-3 text-[0.9rem] no-underline transition-colors duration-200 active:scale-[0.99]",
        active
          ? "bg-[#3B0E1A]/[0.07] text-[#1A060B] font-medium"
          : "text-[#9C8A8B] font-normal hover:bg-[#3B0E1A]/[0.05] hover:text-[#1A060B]"
      )}
    >
      <Icon
        size={18}
        strokeWidth={1.75}
        className={cn("flex-shrink-0", active ? "text-[#3B0E1A]" : "text-[#9C8A8B] group-hover:text-[#3B0E1A]")}
      />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
};

/* ── Main layout ───────────────────────────────────────────────────── */
const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);       // mobile drawer
  const [menuOpen, setMenuOpen] = useState(false); // desktop profile dropdown
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  /* Close the profile dropdown on outside click / route change. */
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); setOpen(false); }, [pathname]);

  const initials = (user?.displayName ?? user?.display_name)
    ? (user?.displayName ?? user?.display_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : "U";

  const firstName = (user?.displayName ?? user?.display_name)?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "Tú";
  const photoUrl = user?.photoUrl ?? user?.photo_url;

  /* ── mobile bottom nav items ── */
  const BOTTOM_NAV = [
    { to: "/app", icon: LayoutDashboard, label: "Inicio" },
    { to: "/app/classes", icon: Calendar, label: "Clases" },
    { to: "/app/bookings", icon: ClipboardList, label: "Reservas" },
    { to: "/app/profile", icon: User, label: "Perfil" },
  ];

  const Avatar = ({ size = 36 }: { size?: number }) => (
    <span
      className="flex items-center justify-center rounded-full bg-[#3B0E1A] text-[0.8rem] font-medium text-[#F3EFE9] overflow-hidden"
      style={{ height: size, width: size }}
    >
      {photoUrl
        ? <img src={photoUrl} className="h-full w-full rounded-full object-cover" alt="" />
        : initials}
    </span>
  );

  return (
    <div className="client-shell flex min-h-[100dvh] flex-col bg-background">

      {/* ── DESKTOP TOP NAV ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 hidden border-b border-[#E9D9D9] bg-surface lg:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6 xl:px-10">

          {/* Brand */}
          <Link to="/" className="flex flex-shrink-0 items-center gap-3 no-underline" aria-label="VARRE24 — Inicio">
            <img src="/brand/varre24-logo-black.svg" alt="VARRE24" className="h-5 w-auto" />
            <span className="hidden border-l border-[#E9D9D9] pl-3 text-[0.58rem] uppercase tracking-[0.32em] text-[#9C8A8B] xl:inline">
              Barre &amp; Pilates
            </span>
          </Link>

          {/* Primary nav */}
          <nav className="flex flex-1 items-center justify-center gap-1">
            {PRIMARY_NAV.map((item) => (
              <TopNavLink key={item.to} {...item} />
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Membership CTA */}
            <Link
              to="/app/checkout"
              className="flex items-center gap-2 rounded-full bg-[#3B0E1A] px-4 py-2 text-[0.82rem] font-medium text-[#F3EFE9] no-underline transition-colors duration-200 hover:bg-[#320C16]"
            >
              <Sparkles size={15} strokeWidth={1.75} />
              <span>Membresía</span>
            </Link>

            {/* Notifications */}
            <Link
              to="/app/notifications"
              aria-label="Notificaciones"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#9C8A8B] transition-colors duration-200 hover:bg-[#3B0E1A]/[0.07] hover:text-[#3B0E1A]"
            >
              <Bell size={18} strokeWidth={1.75} />
            </Link>

            {/* Profile dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-colors duration-200",
                  menuOpen || pathname.startsWith("/app/profile")
                    ? "border-[#E9D9D9] bg-[#3B0E1A]/[0.05]"
                    : "border-transparent hover:border-[#E9D9D9] hover:bg-[#3B0E1A]/[0.04]"
                )}
              >
                <Avatar size={30} />
                <span className="max-w-[8rem] truncate text-[0.82rem] font-medium text-[#1A060B]">{firstName}</span>
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  className={cn("text-[#9C8A8B] transition-transform duration-200", menuOpen ? "rotate-90" : "rotate-0")}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.5rem)] w-60 origin-top-right overflow-hidden rounded-2xl border border-[#E9D9D9] bg-surface py-1.5 shadow-soft"
                >
                  {/* Identity */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] font-medium leading-tight text-[#1A060B]">{firstName}</p>
                      <p className="truncate text-[0.72rem] leading-tight text-[#9C8A8B]">{user?.email}</p>
                    </div>
                  </div>

                  <div className="my-1 h-px bg-[#E9D9D9]" />

                  <Link to="/app/profile" role="menuitem" className="flex items-center gap-3 px-3 py-2.5 text-[0.84rem] text-[#320C16] no-underline transition-colors hover:bg-[#3B0E1A]/[0.06] hover:text-[#1A060B]">
                    <User size={16} strokeWidth={1.75} className="text-[#9C8A8B]" />
                    <span>Mi perfil</span>
                  </Link>
                  <Link to="/app/profile/preferences" role="menuitem" className="flex items-center gap-3 px-3 py-2.5 text-[0.84rem] text-[#320C16] no-underline transition-colors hover:bg-[#3B0E1A]/[0.06] hover:text-[#1A060B]">
                    <Settings size={16} strokeWidth={1.75} className="text-[#9C8A8B]" />
                    <span>Configuración</span>
                  </Link>
                  <Link to="/app/notifications" role="menuitem" className="flex items-center gap-3 px-3 py-2.5 text-[0.84rem] text-[#320C16] no-underline transition-colors hover:bg-[#3B0E1A]/[0.06] hover:text-[#1A060B]">
                    <Bell size={16} strokeWidth={1.75} className="text-[#9C8A8B]" />
                    <span>Notificaciones</span>
                  </Link>

                  <div className="my-1 h-px bg-[#E9D9D9]" />

                  <button
                    onClick={handleLogout}
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-[0.84rem] text-[#320C16] transition-colors hover:bg-[#3B0E1A]/[0.06] hover:text-[#1A060B]"
                  >
                    <LogOut size={16} strokeWidth={1.75} className="text-[#9C8A8B]" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── MOBILE TOPBAR ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#E9D9D9] bg-surface px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3B0E1A] transition-colors hover:bg-[#3B0E1A]/[0.07]"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>

        <Link to="/" aria-label="VARRE24 — Inicio">
          <img src="/brand/varre24-logo-black.svg" alt="VARRE24" className="h-5 w-auto" />
        </Link>

        <Link
          to="/app/notifications"
          aria-label="Notificaciones"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#3B0E1A] transition-colors hover:bg-[#3B0E1A]/[0.07]"
        >
          <Bell size={20} strokeWidth={1.75} />
        </Link>
      </header>

      {/* ── MOBILE DRAWER ────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-[#1A060B]/30 lg:hidden"
          style={{ animation: "fade-up 0.2s ease both" }}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col border-r border-[#E9D9D9] bg-surface transition-transform duration-300 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ transitionTimingFunction: "var(--ease-drawer)" }}
      >
        {/* Drawer header */}
        <div className="flex h-16 items-center justify-between border-b border-[#E9D9D9] px-5">
          <Link to="/" className="no-underline" aria-label="VARRE24 — Inicio">
            <img src="/brand/varre24-logo-black.svg" alt="VARRE24" className="h-5 w-auto" />
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#3B0E1A] transition-colors hover:bg-[#3B0E1A]/[0.07]"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* User card */}
        <Link
          to="/app/profile"
          onClick={() => setOpen(false)}
          className={cn(
            "mx-3 mt-4 flex items-center gap-3 rounded-2xl border border-[#E9D9D9] px-3.5 py-3 no-underline transition-colors duration-200 hover:bg-[#3B0E1A]/[0.04]",
            pathname.startsWith("/app/profile") && "bg-[#3B0E1A]/[0.05]"
          )}
        >
          <Avatar size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.86rem] font-medium leading-tight text-[#1A060B]">{firstName}</p>
            <p className="truncate text-[0.74rem] leading-tight text-[#9C8A8B]">{user?.email}</p>
          </div>
          <ChevronRight size={15} strokeWidth={2} className="flex-shrink-0 text-[#9C8A8B]" />
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pt-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[0.64rem] font-medium uppercase tracking-[0.22em] text-[#9C8A8B]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <DrawerLink key={item.to} {...item} onClick={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Drawer bottom actions */}
        <div className="space-y-1 border-t border-[#E9D9D9] p-3">
          <Link
            to="/app/checkout"
            onClick={() => setOpen(false)}
            className="mb-1 flex items-center gap-3 rounded-xl bg-[#3B0E1A] px-3 py-3 text-[0.86rem] font-medium text-[#F3EFE9] no-underline transition-colors duration-200 hover:bg-[#320C16]"
          >
            <Sparkles size={18} strokeWidth={1.75} />
            <span>Adquirir membresía</span>
          </Link>
          <Link
            to="/app/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.86rem] text-[#9C8A8B] no-underline transition-colors duration-200 hover:bg-[#3B0E1A]/[0.05] hover:text-[#1A060B]"
          >
            <Bell size={18} strokeWidth={1.75} />
            <span>Notificaciones</span>
          </Link>
          <Link
            to="/app/profile/preferences"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.86rem] text-[#9C8A8B] no-underline transition-colors duration-200 hover:bg-[#3B0E1A]/[0.05] hover:text-[#1A060B]"
          >
            <Settings size={18} strokeWidth={1.75} />
            <span>Configuración</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.86rem] text-[#9C8A8B] transition-colors duration-200 hover:bg-[#3B0E1A]/[0.05] hover:text-[#1A060B]"
          >
            <LogOut size={18} strokeWidth={1.75} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl p-4 pb-28 lg:px-10 lg:py-8 lg:pb-12">
          {children}
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV ────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#E9D9D9] bg-surface pb-safe lg:hidden">
        {BOTTOM_NAV.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to !== "/app" && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 no-underline transition-colors active:scale-[0.97]"
            >
              <Icon
                size={20}
                strokeWidth={1.75}
                className={active ? "text-[#3B0E1A]" : "text-[#9C8A8B]"}
              />
              <span className={cn(
                "text-[0.62rem] leading-none",
                active ? "font-medium text-[#3B0E1A]" : "font-normal text-[#9C8A8B]"
              )}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default ClientLayout;
