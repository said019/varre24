import { motion, useReducedMotion, useMotionValue, useSpring } from "framer-motion";
import type { ReactNode, MouseEvent } from "react";

interface MagneticButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function MagneticButton({ children, href, onClick, className }: MagneticButtonProps) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });

  const onMove = (e: MouseEvent<HTMLElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.25);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.25);
  };
  const reset = () => { x.set(0); y.set(0); };

  const common = {
    className,
    style: { x, y },
    onMouseMove: onMove,
    onMouseLeave: reset,
    whileTap: reduce ? undefined : { scale: 0.96 },
  };

  if (href) {
    return (
      <motion.a href={href} {...common}>{children}</motion.a>
    );
  }
  return (
    <motion.button type="button" onClick={onClick} {...common}>{children}</motion.button>
  );
}
