import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
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
    <div className="admin-shell flex min-h-[100dvh] bg-background text-foreground font-alilato">
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-[#2A211B]/35 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 shrink-0",
          "border-r border-[#3A2F26] bg-[#2A211B] text-[#E8DED4]",
          "w-[86vw] max-w-[290px] -translate-x-full lg:translate-x-0 lg:static",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[78px]" : "lg:w-[252px]",
        )}
      >
        {/* Brand lockup */}
        <div
          className={cn(
            "flex items-center border-b border-[#3A2F26] shrink-0 h-16",
            isCompact ? "justify-center px-3" : "justify-between px-5",
          )}
        >
          {isCompact ? (
            <img src="/brand/varre24-icon.svg" alt="VARRE24" className="h-9 w-9 rounded-lg" />
          ) : (
            <Link to="/admin/dashboard" className="flex items-center gap-3 min-w-0 no-underline">
              <img src="/brand/varre24-logo-cream.svg" alt="VARRE24" className="h-5 w-auto object-contain" />
              <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-[#CBBFAF] pt-0.5">
                Admin
              </span>
            </Link>
          )}

          <button
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden items-center justify-center w-9 h-9 rounded-lg text-[#CBBFAF] hover:text-[#E8DED4] hover:bg-[#3A2F26] transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={16} strokeWidth={1.75} />
          </button>

          {!isCompact && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-[#8A8077] hover:text-[#E8DED4] hover:bg-[#3A2F26] transition-colors"
              aria-label="Contraer menú"
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {isCompact && (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden lg:flex items-center justify-center mx-auto mt-3 w-8 h-8 rounded-lg text-[#8A8077] hover:text-[#E8DED4] hover:bg-[#3A2F26] transition-colors"
            aria-label="Expandir menú"
          >
            <Menu size={16} strokeWidth={1.75} />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-5 scrollbar-thin">
          {NAV_GROUPS.map((group, gi) => {
            const isGroupActive = activeGroup?.label === group.label;
            const isOpen = group.collapsible ? (openGroups[group.label] ?? isGroupActive) : true;

            return (
              <div key={group.label} className={cn(gi > 0 && "mt-6")}>
                {!isCompact && (
                  group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-3 py-1.5 mb-1 group"
                    >
                      <span className="text-[10px] font-medium tracking-[0.28em] uppercase text-[#8A8077] transition-colors group-hover:text-[#CBBFAF]">
                        {group.label}
                      </span>
                      <ChevronDown
                        size={12}
                        strokeWidth={1.75}
                        className={cn("text-[#8A8077] transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")}
                      />
                    </button>
                  ) : (
                    <p className="px-3 py-1.5 mb-1 text-[10px] font-medium tracking-[0.28em] uppercase text-[#8A8077]">
                      {group.label}
                    </p>
                  )
                )}

                {(isCompact || isOpen) && (
                  <div className="space-y-0.5">
                    {group.items.map(({ path, label, icon: Icon }) => {
                      const active = location.pathname === path || location.pathname.startsWith(path + "/");
                      return (
                        <Link
                          key={path}
                          to={path}
                          title={isCompact ? label : undefined}
                          className={cn(
                            "relative flex items-center gap-3 rounded-lg no-underline transition-colors duration-200",
                            isCompact ? "justify-center py-3" : "px-3 py-2.5",
                            active
                              ? "bg-[#5B4A3E]/18 text-[#F6F2EB]"
                              : "text-[#CBBFAF] hover:text-[#E8DED4] hover:bg-[#3A2F26]/70",
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-[#CBBFAF]" />
                          )}
                          <Icon
                            size={17}
                            strokeWidth={1.75}
                            className={cn("shrink-0 transition-colors", active ? "text-[#E8DED4]" : "text-[#8A8077]")}
                          />
                          {!isCompact && (
                            <span className={cn("text-[13.5px] leading-none truncate", active ? "font-medium" : "font-normal")}>
                              {label}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[#3A2F26] px-3 py-3 shrink-0 space-y-0.5">
          <Link
            to="/"
            title={isCompact ? "Ver sitio" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg py-2.5 no-underline transition-colors",
              "text-[#8A8077] hover:text-[#E8DED4] hover:bg-[#3A2F26]/70",
              isCompact ? "justify-center" : "px-3",
            )}
          >
            <Globe size={16} strokeWidth={1.75} className="shrink-0" />
            {!isCompact && <span className="text-[13px]">Ver sitio</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={isCompact ? "Salir" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg py-2.5 w-full transition-colors",
              "text-[#8A8077] hover:text-[#E8DED4] hover:bg-[#3A2F26]/70",
              isCompact ? "justify-center" : "px-3",
            )}
          >
            <LogOut size={16} strokeWidth={1.75} className="shrink-0" />
            {!isCompact && <span className="text-[13px]">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="shrink-0 h-16 flex items-center justify-between px-3 sm:px-5 lg:px-7 border-b border-[#E8DDD5] bg-background sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#5B4A3E] hover:text-[#2A211B] hover:bg-[#E8DDD5]/60 transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            <span className="text-[#8A8077] text-[11px] sm:text-xs font-medium tracking-[0.22em] uppercase">Admin</span>
            {currentItem && (
              <>
                <ChevronRight size={13} strokeWidth={1.75} className="text-[#CBBFAF] shrink-0" />
                <span className="text-foreground text-xs sm:text-sm font-medium truncate">{currentItem.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <AdminPendingBell />
            <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#E8DDD5] px-2.5 py-1 text-[11px] text-[#8A8077] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8A8077]" />
              En línea
            </span>
            <div className="w-px h-4 bg-[#E8DDD5] hidden sm:block" />
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#2A211B] flex items-center justify-center text-[11px] font-medium text-[#E8DED4]">
                {user?.displayName?.[0]?.toUpperCase() ?? user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
              </div>
              {!isCompact && (
                <span className="text-xs text-[#8A8077] hidden md:block truncate max-w-[180px]">
                  {user?.displayName ?? user?.display_name ?? user?.email ?? "Admin"}
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="admin-mobile-main flex-1 overflow-auto pb-[88px] lg:pb-0">{children}</main>

        {isMobile && (
          <nav className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-[#E8DDD5] bg-[#FBF8F4] p-1 pb-safe lg:hidden">
            <ul className="grid grid-cols-5 gap-1">
              {MOBILE_QUICK_NAV.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex h-12 min-h-[44px] flex-col items-center justify-center rounded-xl text-[11px] font-medium transition-colors",
                        active
                          ? "bg-[#2A211B] text-[#E8DED4]"
                          : "text-[#8A8077] hover:bg-[#E8DDD5]/60 hover:text-[#2A211B]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon size={16} strokeWidth={1.75} />
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
