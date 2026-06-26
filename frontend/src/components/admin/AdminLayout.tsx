import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import pilatesRoomLogo from "@/assets/pilates-room-logo.png";
import type { User } from "@/types/auth";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign, BarChart3, Gift, History, Tag,
  Settings, ChevronLeft, ChevronRight, ChevronDown, LogOut, Globe, Menu, X,
} from "lucide-react";
import { AdminPendingBell } from "./AdminPendingBell";

const NAV_GROUPS = [
  {
    label: "Principal",
    collapsible: false,
    accentColor: "#836A5D",
    items: [
      { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { path: "/admin/clients", label: "Clientes", icon: Users },
      { path: "/admin/payments", label: "Pagos", icon: DollarSign },
      { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
    ],
  },
  {
    label: "Gestión",
    collapsible: true,
    accentColor: "#C8B79E",
    items: [
      { path: "/admin/plans", label: "Planes", icon: Package },
      { path: "/admin/memberships", label: "Membresías", icon: CreditCard },
      { path: "/admin/classes", label: "Clases", icon: CalendarDays },
      { path: "/admin/referrals", label: "Referidos", icon: Gift },
      { path: "/admin/discount-codes", label: "Cupones", icon: Tag },
      { path: "/admin/reports", label: "Reportes", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    collapsible: false,
    accentColor: "#836A5D",
    items: [
      { path: "/admin/audit", label: "Auditoría", icon: History },
      { path: "/admin/settings", label: "Configuración", icon: Settings },
    ],
  },
];

const MOBILE_QUICK_NAV = [
  { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
  { path: "/admin/classes", label: "Clases", icon: CalendarDays },
  { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
  { path: "/admin/clients", label: "Clientes", icon: Users },
  { path: "/admin/payments", label: "Pagos", icon: DollarSign },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Gestión: true,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user as User | null);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    logout();
    navigate("/auth/login");
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentItem = allItems.find(
    (i) => location.pathname === i.path || location.pathname.startsWith(i.path + "/"),
  );

  const activeGroup = NAV_GROUPS.find((g) =>
    g.items.some((i) => location.pathname === i.path || location.pathname.startsWith(i.path + "/")),
  );

  const isCompact = collapsed && !mobileOpen;

  return (
    <div className="admin-shell flex min-h-[100dvh] bg-[#f8f3ea] text-[#2d2d2d]">
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-[#2d251f]/35 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 shrink-0",
          "border-r border-[#f5ecdb]/10",
          "bg-[#2f2823] text-[#f8f3ea] shadow-[18px_0_60px_rgba(47,40,35,0.18)]",
          "w-[88vw] max-w-[300px] -translate-x-full lg:translate-x-0 lg:static",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-[260px]",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-[#f5ecdb]/10 shrink-0",
            isCompact ? "justify-center px-3 py-5" : "justify-between px-5 py-6",
          )}
        >
          {!isCompact && (
            <div className="min-w-0">
              <img src={pilatesRoomLogo} alt="Pilates Room" className="h-20 w-auto object-contain drop-shadow-sm" />
              <p className="mt-1 text-[13px] font-bold uppercase tracking-[0.22em] text-[#f5ecdb]/90">
                Pilates Room
              </p>
            </div>
          )}

          <button
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden items-center justify-center w-9 h-9 rounded-xl text-[#f5ecdb]/70 hover:text-[#f5ecdb] hover:bg-[#f5ecdb]/10 active:scale-[0.98] transition-all"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "hidden lg:flex items-center justify-center w-8 h-8 rounded-xl transition-all active:scale-[0.98]",
              "text-[#f5ecdb]/55 hover:text-[#f5ecdb] hover:bg-[#f5ecdb]/10",
            )}
            aria-label="Contraer menú"
          >
            {collapsed ? <Menu size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 scrollbar-thin">
          {NAV_GROUPS.map((group) => {
            const isGroupActive = activeGroup?.label === group.label;
            const isOpen = group.collapsible ? (openGroups[group.label] ?? isGroupActive) : true;

            return (
              <div key={group.label} className="mb-1">
                {!isCompact && (
                  group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-5 py-1.5 group"
                    >
                      <span
                        className="text-[10px] font-semibold tracking-[0.22em] uppercase transition-colors"
                        style={{ color: isGroupActive ? "#F5ECDB" : "#F5ECDB88" }}
                      >
                        {group.label}
                      </span>
                      <ChevronDown
                        size={11}
                        className={cn("transition-all duration-200", isOpen ? "rotate-0" : "-rotate-90")}
                        style={{ color: "#F5ECDB88" }}
                      />
                    </button>
                  ) : (
                    <p
                      className="px-5 py-1.5 text-[10px] font-semibold tracking-[0.22em] uppercase"
                      style={{ color: "#F5ECDB88" }}
                    >
                      {group.label}
                    </p>
                  )
                )}

                {(isCompact || isOpen) && group.items.map(({ path, label, icon: Icon }) => {
                  const active = location.pathname === path || location.pathname.startsWith(path + "/");
                  const accent = group.accentColor;
                  return (
                    <Link
                      key={path}
                      to={path}
                      title={isCompact ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 mx-0.5 my-1 rounded-2xl border transition-all duration-200 no-underline group active:scale-[0.98]",
                        isCompact ? "px-0 justify-center py-3" : "px-3.5 py-3",
                        active
                          ? "border-[#f5ecdb]/18 bg-[#f5ecdb] font-semibold text-[#2f2823] shadow-[0_16px_38px_-24px_rgba(245,236,219,0.9)]"
                          : "border-transparent text-[#f5ecdb]/58 hover:text-[#f5ecdb] hover:bg-[#f5ecdb]/8",
                      )}
                    >
                      <Icon
                        size={15}
                        className="shrink-0 transition-colors"
                        style={{ color: active ? accent : undefined }}
                      />
                      {!isCompact && (
                        <span className="text-[13px] leading-none truncate">{label}</span>
                      )}
                      {active && !isCompact && (
                        <span
                          className="ml-auto h-5 w-1 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                      )}
                    </Link>
                  );
                })}

                {isCompact && <div className="mx-3 my-2 h-px bg-[#f5ecdb]/10" />}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[#f5ecdb]/10 pb-3 pt-2 shrink-0">
          <Link
            to="/"
            title={isCompact ? "Ver sitio" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2.5 no-underline transition-all active:scale-[0.98]",
              "text-[#f5ecdb]/45 hover:text-[#f5ecdb] hover:bg-[#f5ecdb]/8 border border-transparent",
              isCompact && "justify-center px-0",
            )}
          >
            <Globe size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Ver sitio</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={isCompact ? "Salir" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2.5 w-[calc(100%-16px)] transition-all active:scale-[0.98]",
              "text-[#f5ecdb]/45 hover:text-[#fecaca] hover:bg-[#7f1d1d]/25 border border-transparent",
              isCompact && "justify-center px-0",
            )}
          >
            <LogOut size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="shrink-0 h-16 flex items-center justify-between px-3 sm:px-5 lg:px-7 border-b border-[#836A5D]/12 bg-[#fbf7ef]/82 backdrop-blur-xl sticky top-0 z-30 shadow-[0_12px_40px_-34px_rgba(84,67,49,0.75)]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#836A5D] hover:text-[#2d2d2d] hover:bg-[#836A5D]/10 active:scale-[0.98] transition-all"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={16} />
            </button>
            <span className="text-[#836A5D]/50 text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase">Admin</span>
            {currentItem && (
              <>
                <ChevronRight size={12} className="text-[#836A5D]/30 shrink-0" />
                <span className="text-[#2d2d2d] text-xs sm:text-sm font-semibold truncate">{currentItem.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <AdminPendingBell />
            <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#836A5D]/10 bg-white/45 px-2.5 py-1 text-[11px] text-[#836A5D]/70 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8f7559] shadow-[0_0_0_4px_rgba(143,117,89,0.12)] animate-pulse" />
              En línea
            </span>
            <div className="w-px h-4 bg-[#836A5D]/15 hidden sm:block" />
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#2f2823] flex items-center justify-center text-[11px] font-bold text-[#f5ecdb] shadow-sm ring-1 ring-[#836A5D]/10">
                {user?.displayName?.[0]?.toUpperCase() ?? user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
              </div>
              {!isCompact && (
                <span className="text-xs text-[#2d2d2d]/55 hidden md:block truncate max-w-[180px]">
                  {user?.displayName ?? user?.display_name ?? user?.email ?? "Admin"}
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="admin-mobile-main flex-1 overflow-auto pb-[88px] lg:pb-0">{children}</main>

        {isMobile && (
          <nav className="fixed inset-x-2 bottom-2 z-40 rounded-[22px] border border-[#836A5D]/12 bg-[#fbf7ef]/95 p-1 pb-safe backdrop-blur-xl lg:hidden shadow-[0_18px_48px_-22px_rgba(84,67,49,0.42)]">
            <ul className="grid grid-cols-5 gap-1">
              {MOBILE_QUICK_NAV.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex h-12 min-h-[44px] flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors",
                        active
                          ? "bg-[#2f2823] text-[#f5ecdb] shadow-md shadow-[#836A5D]/20"
                          : "text-[#2d2d2d]/45 hover:bg-[#836A5D]/8 hover:text-[#2d2d2d]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon size={14} />
                      <span className="mt-0.5 leading-none">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
};

export default AdminLayout;
