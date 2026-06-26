/**
 * Styled date picker for the Pilates Room palette.
 * Works on both light admin pages and light client pages.
 * Accepts and emits "YYYY-MM-DD" strings.
 */
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, isSameDay, isSameMonth, isToday, parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string;           // "YYYY-MM-DD"
  onChange?: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string;             // "YYYY-MM-DD"
}

const DAYS_SHORT = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

const safeParseISO = (s?: string): Date | null => {
  if (!s) return null;
  try { return parseISO(s); } catch { return null; }
};

export const DatePicker = ({
  value, onChange, placeholder = "Seleccionar fecha",
  className, disabled, min,
}: DatePickerProps) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(safeParseISO(value) ?? new Date());
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const selected = safeParseISO(value);
  const minDate  = safeParseISO(min);

  useEffect(() => {
    if (value) setViewMonth(safeParseISO(value) ?? new Date());
  }, [value]);

  // Click fuera del trigger y el popover → cerrar
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Recalcular posición cuando abre o cambia la ventana
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      setPopoverPos({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const select = (d: Date) => {
    onChange?.(format(d, "yyyy-MM-dd"));
    setOpen(false);
  };

  const monthStart = startOfMonth(viewMonth);
  const monthEnd   = endOfMonth(viewMonth);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd,   { weekStartsOn: 1 });

  const days: Date[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  if (isMobile) {
    return (
      <div className={cn("relative w-full", className)}>
        <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#836A5D]" />
        <input
          type="date"
          min={min}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            "w-full rounded-xl border border-[#836A5D]/20 bg-white py-2.5 pl-9 pr-3 text-sm text-[#2d2d2d]",
            "focus:border-[#836A5D]/50 focus:outline-none",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          aria-label={placeholder}
        />
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative inline-block w-full", className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-[#836A5D]/20 bg-white px-3 py-2.5 text-sm transition-all",
          "hover:border-[#836A5D]/40 focus:outline-none",
          open ? "border-[#836A5D]/50 ring-1 ring-[#836A5D]/20" : "",
          disabled && "opacity-50 pointer-events-none",
        )}
      >
        <CalendarDays size={14} className="shrink-0 text-[#836A5D]" />
        <span className={cn("flex-1 text-left", selected ? "text-[#2d2d2d] font-medium" : "text-[#836A5D]/50")}>
          {selected
            ? format(selected, "d 'de' MMMM yyyy", { locale: es })
            : placeholder}
        </span>
        <ChevronRight
          size={13}
          className={cn("text-[#836A5D]/40 transition-transform", open && "rotate-90")}
        />
      </button>

      {/* Dropdown calendar (Portal al body para escapar de stacking contexts) */}
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: popoverPos.top,
            left: popoverPos.left,
            minWidth: Math.max(280, popoverPos.width),
            zIndex: 9999,
          }}
          className="rounded-2xl border border-[#836A5D]/15 bg-white shadow-xl shadow-black/10 p-4"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#836A5D]/50 hover:text-[#836A5D] hover:bg-[#836A5D]/10 transition-all"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-sm font-semibold text-[#2d2d2d] capitalize">
              {format(viewMonth, "MMMM yyyy", { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#836A5D]/50 hover:text-[#836A5D] hover:bg-[#836A5D]/10 transition-all"
            >
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-[#836A5D]/60 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const isSelected   = selected && isSameDay(d, selected);
              const isThisMonth  = isSameMonth(d, viewMonth);
              const isCurrentDay = isToday(d);
              const isDisabled   = minDate ? d < minDate : false;

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && select(d)}
                  className={cn(
                    "h-8 w-full rounded-lg text-xs font-medium transition-all",
                    isSelected
                      ? "bg-[#836A5D] text-white shadow-sm"
                      : isCurrentDay && !isSelected
                        ? "border border-[#C8B79E] text-[#2d2d2d] bg-[#C8B79E]/10"
                        : isThisMonth
                          ? "text-[#2d2d2d] hover:bg-[#836A5D]/10"
                          : "text-[#836A5D]/30",
                    isDisabled && "opacity-25 cursor-not-allowed"
                  )}
                >
                  {format(d, "d")}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-3 pt-2 border-t border-[#836A5D]/10 flex justify-center">
            <button
              type="button"
              onClick={() => select(new Date())}
              className="text-[11px] text-[#836A5D] hover:text-[#2d2d2d] transition-colors font-medium"
            >
              Hoy
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DatePicker;
