import { motion, useReducedMotion } from "framer-motion";

interface KineticHeadingProps {
  text: string;
  className?: string;
}

// Reveal por máscara: el texto sube desde debajo de un contenedor con overflow oculto.
export function KineticHeading({ text, className }: KineticHeadingProps) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <span className="inline-block overflow-hidden align-bottom">
      <motion.span
        className={`inline-block ${className ?? ""}`}
        initial={{ y: "110%" }}
        whileInView={{ y: "0%" }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        {text}
      </motion.span>
    </span>
  );
}
