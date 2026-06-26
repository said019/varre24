/**
 * ClassCategoryBadge
 *
 * Pill-shaped badge that visually identifies a VARRE24 class category.
 * Category is derived from the class type name (case-insensitive):
 *   - contains "barre"                  → barre
 *   - contains "experience" | "especial"
 *     | "b'day" | "birthday" | "event"  → especial
 *   - anything else                     → pilates (default)
 *
 * All three variants use VARRE24 brand colors only (no legacy taupe/cacao hex).
 */

import React from "react";

export type ClassCategory = "pilates" | "barre" | "especial";

// ── Brand palette ─────────────────────────────────────────────────────────────
const BADGE_STYLES: Record<
  ClassCategory,
  { background: string; color: string; border: string; label: string }
> = {
  pilates: {
    background: "#F6F2EB",
    color:      "#5B4A3E",
    border:     "1px solid #E8DDD5",
    label:      "PILATES",
  },
  barre: {
    background: "#E8DED4",
    color:      "#3A2F26",
    border:     "1px solid #B5A593",
    label:      "BARRE",
  },
  especial: {
    background: "#CBBFAF",
    color:      "#4A3D32",
    border:     "1px solid #B5A593",
    label:      "ESPECIAL",
  },
};

// ── Category inference ────────────────────────────────────────────────────────
export function inferCategory(classTypeName: string): ClassCategory {
  const n = (classTypeName ?? "").toLowerCase();
  if (n.includes("barre")) return "barre";
  if (
    n.includes("experience") ||
    n.includes("especial") ||
    n.includes("b'day") ||
    n.includes("bday") ||
    n.includes("birthday") ||
    n.includes("event") ||
    n.includes("evento")
  ) return "especial";
  return "pilates";
}

// ── Component ─────────────────────────────────────────────────────────────────
interface ClassCategoryBadgeProps {
  /** The class type name string (e.g. "Barre", "Pilates Mat", "Experience Class"). */
  classTypeName: string;
  /** Optional override — use when the backend already resolves the category. */
  category?: ClassCategory;
  className?: string;
}

export const ClassCategoryBadge: React.FC<ClassCategoryBadgeProps> = ({
  classTypeName,
  category,
  className,
}) => {
  const cat = category ?? inferCategory(classTypeName);
  const s   = BADGE_STYLES[cat];

  return (
    <span
      className={className}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        background:    s.background,
        color:         s.color,
        border:        s.border,
        borderRadius:  "9999px",
        fontSize:      "0.68rem",
        fontWeight:    600,
        letterSpacing: "0.10em",
        lineHeight:    1,
        padding:       "0.2em 0.65em",
        textTransform: "uppercase",
        whiteSpace:    "nowrap",
        flexShrink:    0,
      }}
      aria-label={`Categoría: ${cat}`}
    >
      {s.label}
    </span>
  );
};
