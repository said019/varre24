# VARRE24 Landing "Editorial en movimiento" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el landing público de VARRE24 por una pieza "editorial en movimiento" (Mezcla A+B) con paleta Red Pink Bold, y agregar un sistema de movimiento global (Framer Motion) que aplica transiciones de página a landing, portal y admin.

**Architecture:** Primitivas de movimiento reutilizables en `src/lib/motion/`; secciones del landing aisladas en `src/components/landing/`; `Index.tsx` como orquestador delgado; transiciones de ruta globales vía un `AnimatedRoutes` con `AnimatePresence` en `App.tsx` (no se reescribe ninguna pantalla de portal/admin).

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + Framer Motion. Tests: Vitest + @testing-library/react (jsdom). Alias `@` → `src/`.

## Global Constraints

- **Paleta (solo estos brand hex / tokens):** Cherry Cola `#7C0116` (primario/`bg-primary`), Claret `#670626` (profundo), Pink `#FFBDC5`, Hibiscus `#E0A4B0`, blush bg `#FFF1F3` (`bg-background`), superficie `#FFF7F8`, ink `#2B0911` (`text-foreground`), borde `#F3CCD4`. No introducir hex fuera de esta familia (salvo estados verde/rojo/ámbar existentes).
- **Tipografía:** títulos con clase `font-bebas` (→ Anton) o `font-editorial` (→ Fraunces, para itálicas); cuerpo Inter Tight (default `body`). No nuevas fuentes.
- **Movimiento:** solo animar `transform`/`opacity`. Respetar `prefers-reduced-motion` vía `useReducedMotion()` de Framer Motion (degradar a sin animación).
- **Contenido real (varre24fit.com):** clases BARRE / PILATES MAT / EXPERIENCE CLASS / YOGA / EVENTOS; 60 min, cupo 7; fundadora Alexandra Murillo; WhatsApp `17736489987`; IG `@varre.studio`; dirección Arizona 14, Piso 3, Col. Nápoles, Benito Juárez, CDMX. Planes: $120 / $270 / $500 / $990 / $16,000 MXN.
- **No romper** portal (`/app/*`) ni admin (`/admin/*`): siguen funcionando, solo reciben la transición de página.
- **Verificación por tarea:** `npm run build --workspace frontend` debe quedar verde y `npm test` (vitest) pasar. Todos los comandos se corren desde la raíz del repo `/Users/saidromero/Desktop/Varre24/varre24` salvo que se indique.

---

### Task 1: Agregar dependencia framer-motion

**Files:**
- Modify: `frontend/package.json` (vía npm)

- [ ] **Step 1: Instalar framer-motion en el workspace frontend**

Run:
```bash
cd /Users/saidromero/Desktop/Varre24/varre24 && npm install framer-motion@^11 --workspace frontend
```
Expected: `package.json` de frontend ahora lista `"framer-motion": "^11..."` en dependencies.

- [ ] **Step 2: Verificar build verde**

Run:
```bash
npm run build --workspace frontend
```
Expected: `✓ built in ...` sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json package-lock.json
git commit -m "build(frontend): add framer-motion for motion system"
```

---

### Task 2: Variants base + componente Reveal + barrel

**Files:**
- Create: `frontend/src/lib/motion/variants.ts`
- Create: `frontend/src/lib/motion/Reveal.tsx`
- Create: `frontend/src/lib/motion/index.ts`
- Test: `frontend/src/lib/motion/motion.test.tsx`

**Interfaces:**
- Produces:
  - `EASE_EMIL: [number, number, number, number]` (cubic-bezier salida calmada)
  - `fadeUp: Variants`, `fade: Variants`, `scaleIn: Variants`
  - `staggerContainer(stagger?: number, delayChildren?: number): Variants`
  - `<Reveal y?: number, delay?: number, className?: string, as?: keyof JSX.IntrinsicElements, children: ReactNode>` — anima children con `fadeUp` al entrar al viewport (`whileInView`, `once`), degradando con `useReducedMotion`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/lib/motion/motion.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Reveal } from "./index";
import { fadeUp, staggerContainer } from "./index";

describe("motion primitives", () => {
  it("Reveal renders its children", () => {
    render(<Reveal><p>contenido visible</p></Reveal>);
    expect(screen.getByText("contenido visible")).toBeInTheDocument();
  });

  it("exports variants with hidden/visible states", () => {
    expect(fadeUp).toHaveProperty("hidden");
    expect(fadeUp).toHaveProperty("visible");
    expect(staggerContainer(0.1)).toHaveProperty("visible");
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/lib/motion/motion.test.tsx`
Expected: FAIL — no existe `./index`.

- [ ] **Step 3: Implementar variants.ts**

`frontend/src/lib/motion/variants.ts`:
```ts
import type { Variants } from "framer-motion";

// Salida calmada estilo Emil (cubic-bezier(0.16,1,0.3,1))
export const EASE_EMIL: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: EASE_EMIL } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_EMIL } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE_EMIL } },
};

export const staggerContainer = (stagger = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
});
```

- [ ] **Step 4: Implementar Reveal.tsx**

`frontend/src/lib/motion/Reveal.tsx`:
```tsx
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { fadeUp } from "./variants";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** desplazamiento vertical inicial (px) */
  y?: number;
  /** retraso en segundos */
  delay?: number;
}

export function Reveal({ children, className, y = 28, delay = 0 }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      variants={fadeUp}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 5: Implementar el barrel index.ts**

`frontend/src/lib/motion/index.ts`:
```ts
export * from "./variants";
export { Reveal } from "./Reveal";
export { MagneticButton } from "./MagneticButton";
export { Marquee } from "./Marquee";
export { KineticHeading } from "./KineticHeading";
export { AnimatedRoutes } from "./AnimatedRoutes";
```
NOTA: las exportaciones de `MagneticButton`, `Marquee`, `KineticHeading` y `AnimatedRoutes` se crean en las Tareas 3 y 4. Si ejecutas esta tarea aislada, comenta temporalmente esas líneas y descoméntalas al llegar a la Tarea 3/4.

- [ ] **Step 6: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/lib/motion/motion.test.tsx`
Expected: PASS (con las líneas no-existentes del barrel comentadas hasta Task 3/4).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/motion/
git commit -m "feat(motion): variants base + Reveal primitive"
```

---

### Task 3: Primitivas MagneticButton, Marquee, KineticHeading

**Files:**
- Create: `frontend/src/lib/motion/MagneticButton.tsx`
- Create: `frontend/src/lib/motion/Marquee.tsx`
- Create: `frontend/src/lib/motion/KineticHeading.tsx`
- Test: `frontend/src/lib/motion/primitives.test.tsx`

**Interfaces:**
- Consumes: `EASE_EMIL` de `./variants`.
- Produces:
  - `<MagneticButton href?: string, onClick?: () => void, className?: string, children: ReactNode>` — botón/enlace con press spring + atracción magnética al puntero (desactivada con reduced-motion). Renderiza `<a>` si hay `href`, si no `<button>`.
  - `<Marquee items: string[], className?: string, separator?: string>` — cinta horizontal infinita (duplica el track; reusa keyframes CSS `scroll-left` ya presentes en index.css).
  - `<KineticHeading text: string, className?: string>` — `<span>` con reveal por máscara (clip) al entrar al viewport.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/lib/motion/primitives.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MagneticButton, Marquee, KineticHeading } from "./index";

describe("motion primitives extra", () => {
  it("MagneticButton renders an anchor when href is given", () => {
    render(<MagneticButton href="/x">Reservar</MagneticButton>);
    const el = screen.getByText("Reservar").closest("a");
    expect(el).toHaveAttribute("href", "/x");
  });
  it("MagneticButton renders a button without href", () => {
    render(<MagneticButton>Click</MagneticButton>);
    expect(screen.getByRole("button", { name: "Click" })).toBeInTheDocument();
  });
  it("Marquee renders its items", () => {
    render(<Marquee items={["MOVIMIENTO", "INTENCIÓN"]} />);
    expect(screen.getAllByText("MOVIMIENTO").length).toBeGreaterThan(0);
  });
  it("KineticHeading renders its text", () => {
    render(<KineticHeading text="BARRE & PILATES" />);
    expect(screen.getByText("BARRE & PILATES")).toBeInTheDocument();
  });
});
```
(El check de Marquee es por duplicación del track; basta con que aparezca al menos una vez.)

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/lib/motion/primitives.test.tsx`
Expected: FAIL — componentes no existen.

- [ ] **Step 3: Implementar MagneticButton.tsx**

`frontend/src/lib/motion/MagneticButton.tsx`:
```tsx
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
```

- [ ] **Step 4: Implementar Marquee.tsx**

`frontend/src/lib/motion/Marquee.tsx`:
```tsx
interface MarqueeProps {
  items: string[];
  className?: string;
  separator?: string;
}

// Usa el keyframe CSS `scroll-left` + util `.animate-scroll-left` ya definidos en index.css.
export function Marquee({ items, className = "", separator = "·" }: MarqueeProps) {
  const track = (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden="false">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-8">
          <span>{it}</span>
          <span className="opacity-50">{separator}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`flex overflow-hidden whitespace-nowrap ${className}`}>
      <div className="flex animate-scroll-left motion-reduce:animate-none">
        {track}
        {track}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implementar KineticHeading.tsx**

`frontend/src/lib/motion/KineticHeading.tsx`:
```tsx
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
```

- [ ] **Step 6: Descomentar las exportaciones en el barrel**

En `frontend/src/lib/motion/index.ts` asegúrate de que estén activas:
```ts
export { MagneticButton } from "./MagneticButton";
export { Marquee } from "./Marquee";
export { KineticHeading } from "./KineticHeading";
```

- [ ] **Step 7: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/lib/motion/primitives.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/motion/
git commit -m "feat(motion): MagneticButton, Marquee, KineticHeading"
```

---

### Task 4: Transiciones de página globales (AnimatedRoutes en App.tsx)

**Files:**
- Create: `frontend/src/lib/motion/AnimatedRoutes.tsx`
- Modify: `frontend/src/App.tsx` (mover `<Routes>` dentro de `<AnimatedRoutes>`)
- Test: `frontend/src/lib/motion/animated-routes.test.tsx`

**Interfaces:**
- Consumes: `react-router-dom` (`useLocation`), `framer-motion` (`AnimatePresence`, `motion`).
- Produces: `<AnimatedRoutes children: ReactNode>` — envuelve los `<Routes>` con un `motion.div` keyed por `location.pathname` dentro de `AnimatePresence mode="wait"`, aplicando fade/slide a cada cambio de ruta (landing/portal/admin). Degradar con `useReducedMotion`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/lib/motion/animated-routes.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AnimatedRoutes } from "./AnimatedRoutes";

describe("AnimatedRoutes", () => {
  it("renders the matched route inside the transition wrapper", () => {
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <AnimatedRoutes>
          <Routes>
            <Route path="/x" element={<p>página X</p>} />
          </Routes>
        </AnimatedRoutes>
      </MemoryRouter>
    );
    expect(screen.getByText("página X")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/lib/motion/animated-routes.test.tsx`
Expected: FAIL — `AnimatedRoutes` no existe.

- [ ] **Step 3: Implementar AnimatedRoutes.tsx**

`frontend/src/lib/motion/AnimatedRoutes.tsx`:
```tsx
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface AnimatedRoutesProps {
  children: ReactNode;
}

export function AnimatedRoutes({ children }: AnimatedRoutesProps) {
  const location = useLocation();
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```
NOTA: `children` debe ser `<Routes location={location}>` para que AnimatePresence detecte la salida; eso se cablea en el siguiente step dentro de `App.tsx`.

- [ ] **Step 4: Cablear en App.tsx**

En `frontend/src/App.tsx`:
1. Añadir imports al inicio:
```tsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatedRoutes } from "@/lib/motion";
```
2. Extraer las rutas a un componente `AppRoutes` que use `useLocation` y envuelva `<Routes location={location}>` con `<AnimatedRoutes>`. Reemplaza el bloque `<Routes>...</Routes>` actual por:
```tsx
const AppRoutes = () => {
  const location = useLocation();
  return (
    <AnimatedRoutes>
      <Routes location={location}>
        {/* ...mismas <Route> que ya existen, sin cambios... */}
      </Routes>
    </AnimatedRoutes>
  );
};
```
3. En el árbol de `App`, dentro de `<BrowserRouter>`, dejar:
```tsx
<BrowserRouter>
  <AppInit />
  <AppRoutes />
</BrowserRouter>
```
(Mover TODAS las `<Route>` existentes al `<Routes location={location}>` de `AppRoutes`, sin alterar paths ni elementos.)

- [ ] **Step 5: Correr tests + build**

Run:
```bash
npm test --workspace frontend -- src/lib/motion/animated-routes.test.tsx
npm run build --workspace frontend
```
Expected: test PASS; build verde.

- [ ] **Step 6: Verificación manual de no-regresión (portal/admin)**

Run:
```bash
npm run build --workspace frontend && (cd frontend && npx vite preview --port 4173 &) && sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/app && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/admin/dashboard
```
Expected: ambos `200` (las SPA routes responden; el index se sirve). Detener el preview tras verificar.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/lib/motion/
git commit -m "feat(motion): global page transitions via AnimatedRoutes"
```

---

### Task 5: Datos del landing (contenido real)

**Files:**
- Create: `frontend/src/components/landing/data.ts`
- Test: `frontend/src/components/landing/data.test.ts`

**Interfaces:**
- Produces:
  - `STUDIO: { address: string; whatsapp: string; instagram: string; instagramUrl: string; mapsQuery: string }`
  - `MANIFESTO: string[]`
  - `CLASSES: { key: string; n: string; name: string; blurb: string }[]`
  - `EXPERIENCES: { name: string; note: string }[]`
  - `FOUNDER: { name: string; role: string; quote: string; paragraphs: string[] }`
  - `PLANS: { name: string; price: string; note: string }[]`
  - `waLink(clase: string): string` — arma el enlace wa.me con texto prellenado.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/data.test.ts`:
```ts
import { CLASSES, PLANS, STUDIO, waLink } from "./data";

describe("landing data", () => {
  it("has the 5 real classes", () => {
    const names = CLASSES.map((c) => c.name);
    expect(names).toEqual(["BARRE", "PILATES MAT", "EXPERIENCE CLASS", "YOGA", "EVENTOS"]);
  });
  it("has 5 plans with prices", () => {
    expect(PLANS).toHaveLength(5);
    expect(PLANS[0].price).toContain("$");
  });
  it("waLink points to the real WhatsApp number", () => {
    expect(waLink("BARRE")).toContain("wa.me/17736489987");
    expect(waLink("BARRE")).toContain("BARRE");
  });
  it("STUDIO has Nápoles address and varre.studio IG", () => {
    expect(STUDIO.address).toContain("Nápoles");
    expect(STUDIO.instagram).toBe("@varre.studio");
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/data.test.ts`
Expected: FAIL — `./data` no existe.

- [ ] **Step 3: Implementar data.ts**

`frontend/src/components/landing/data.ts`:
```ts
export const STUDIO = {
  address: "Arizona 14, Piso 3, Col. Nápoles, Benito Juárez, CDMX",
  whatsapp: "17736489987",
  instagram: "@varre.studio",
  instagramUrl: "https://www.instagram.com/varre.studio",
  mapsQuery: "Arizona+14,+Col.+Nápoles,+Benito+Juárez,+CDMX",
};

export const MANIFESTO = ["MOVIMIENTO", "INTENCIÓN", "ELEGANCIA", "CONSTANCIA"];

export const CLASSES = [
  { key: "barre", n: "N°01", name: "BARRE", blurb: "Ballet, fuerza y resistencia para tonificar cuerpo y postura." },
  { key: "pilates", n: "N°02", name: "PILATES MAT", blurb: "Fuerza profunda, control y equilibrio desde el centro del cuerpo." },
  { key: "experience", n: "N°03", name: "EXPERIENCE CLASS", blurb: "Sesiones temáticas que convierten entrenar en una experiencia." },
  { key: "yoga", n: "N°04", name: "YOGA", blurb: "Flexibilidad, respiración y equilibrio para reconectar." },
  { key: "eventos", n: "N°05", name: "EVENTOS", blurb: "Clases privadas y celebraciones a tu medida." },
];

export const EXPERIENCES = [
  { name: "DJ en vivo", note: "Entrena al ritmo de un set en vivo." },
  { name: "Puppy class", note: "Movimiento y compañía de cuatro patas." },
  { name: "Candle class", note: "Luz de velas, calma y enfoque." },
];

export const FOUNDER = {
  name: "Alexandra Murillo",
  role: "Fundadora",
  quote: "El movimiento se vive con intención, elegancia y constancia.",
  paragraphs: [
    "VARRE24 nace del deseo de crear un espacio donde el movimiento se viva con intención, elegancia y constancia.",
    "Un estudio boutique de barre y pilates en Ciudad de México, pensado para quienes buscan entrenar de forma consciente, fortalecer su cuerpo y disfrutar el proceso.",
    "Cada clase está diseñada para acompañarte, respetar tu ritmo y ayudarte a sentirte fuerte, en equilibrio y conectado contigo.",
  ],
};

export const PLANS = [
  { name: "Clase de prueba", price: "$120", note: "Solo tu primera vez" },
  { name: "Clase individual", price: "$270", note: "1 crédito" },
  { name: "Paquete 4 clases", price: "$500", note: "30 días" },
  { name: "Membresía mensual", price: "$990", note: "Hasta 3 por semana" },
  { name: "Ilimitado 6 meses", price: "$16,000", note: "180 días" },
];

export function waLink(clase: string): string {
  const text = `Hola 🤍%0AMe gustaría reservar una clase de ${clase}%0A%0A¿Me pueden compartir paquetes y horarios disponibles?%0AGracias ✨`;
  return `https://wa.me/${STUDIO.whatsapp}?text=${text}`;
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/data.ts frontend/src/components/landing/data.test.ts
git commit -m "feat(landing): real VARRE24 content data"
```

---

### Task 6: Sección Hero (cinemático + kinetic)

**Files:**
- Create: `frontend/src/components/landing/Hero.tsx`
- Test: `frontend/src/components/landing/Hero.test.tsx`

**Interfaces:**
- Consumes: `KineticHeading`, `MagneticButton` de `@/lib/motion`; `waLink` de `./data`; asset `@/assets/pilates-room-images/index-hero.webp` (placeholder, flagged).
- Produces: `<Hero />` — sin props.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/Hero.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("shows the wordmark headline and a reserve CTA", () => {
    render(<Hero />);
    expect(screen.getByText(/BARRE/)).toBeInTheDocument();
    expect(screen.getByText(/Reserva tu clase/i)).toBeInTheDocument();
    expect(screen.getByText(/Nápoles/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/Hero.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar Hero.tsx**

`frontend/src/components/landing/Hero.tsx`:
```tsx
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { KineticHeading, MagneticButton } from "@/lib/motion";
import { waLink, STUDIO } from "./data";
import heroPhoto from "@/assets/pilates-room-images/index-hero.webp";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[600px] overflow-hidden bg-[#670626] text-[#FFF1F3]">
      {/* Foto con parallax */}
      <motion.img
        src={heroPhoto}
        alt="Estudio VARRE24"
        style={{ y }}
        className="absolute inset-0 h-[118%] w-full object-cover"
      />
      {/* Overlay claret */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#670626]/55 via-[#670626]/35 to-[#2B0911]/85" />

      <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-16 sm:px-10 lg:px-16">
        <p className="font-alilato text-[0.72rem] uppercase tracking-[0.28em] text-[#FFBDC5]">
          Estudio boutique · {STUDIO.address.split(",").slice(2, 4).join(",").trim() || "Nápoles, CDMX"}
        </p>
        <h1 className="font-bebas mt-4 text-[clamp(3rem,12vw,10rem)] leading-[0.82] tracking-tight">
          <KineticHeading text="BARRE" /> <br />
          <span className="text-[#FFBDC5]"><KineticHeading text="& PILATES" /></span>
        </h1>
        <p className="font-editorial mt-5 max-w-xl text-lg italic text-[#E8DED4]">
          Movimiento con intención, elegancia y constancia.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <MagneticButton
            href={waLink("una clase")}
            className="press inline-flex items-center rounded-full bg-[#7C0116] px-8 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]"
          >
            Reserva tu clase
          </MagneticButton>
          <MagneticButton
            href="#clases"
            className="press inline-flex items-center rounded-full border border-[#FFBDC5]/40 px-8 py-4 text-[0.82rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]"
          >
            Conoce el método
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
```
NOTA de marca/asset: `index-hero.webp` es placeholder de Pilates Room (trae texto horneado); reemplazar por foto VARRE24 cuando exista.

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/Hero.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/Hero.tsx frontend/src/components/landing/Hero.test.tsx
git commit -m "feat(landing): cinematic Hero with parallax + kinetic type"
```

---

### Task 7: Sección Manifiesto (marquee)

**Files:**
- Create: `frontend/src/components/landing/Manifesto.tsx`
- Test: `frontend/src/components/landing/Manifesto.test.tsx`

**Interfaces:**
- Consumes: `Marquee` de `@/lib/motion`; `MANIFESTO` de `./data`.
- Produces: `<Manifesto />`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/Manifesto.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Manifesto } from "./Manifesto";

describe("Manifesto", () => {
  it("renders manifesto words", () => {
    render(<Manifesto />);
    expect(screen.getAllByText(/MOVIMIENTO/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/Manifesto.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar Manifesto.tsx**

`frontend/src/components/landing/Manifesto.tsx`:
```tsx
import { Marquee } from "@/lib/motion";
import { MANIFESTO } from "./data";

export function Manifesto() {
  return (
    <section className="bg-[#7C0116] py-6 text-[#FFF1F3]">
      <Marquee
        items={MANIFESTO}
        className="font-bebas text-[clamp(2rem,5vw,4rem)] leading-none tracking-tight"
      />
    </section>
  );
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/Manifesto.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/Manifesto.tsx frontend/src/components/landing/Manifesto.test.tsx
git commit -m "feat(landing): manifesto marquee section"
```

---

### Task 8: Sección Clases (galería editorial)

**Files:**
- Create: `frontend/src/components/landing/ClassesGallery.tsx`
- Test: `frontend/src/components/landing/ClassesGallery.test.tsx`

**Interfaces:**
- Consumes: `Reveal`, `MagneticButton` de `@/lib/motion`; `CLASSES`, `waLink` de `./data`.
- Produces: `<ClassesGallery />` con `id="clases"`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/ClassesGallery.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { ClassesGallery } from "./ClassesGallery";

describe("ClassesGallery", () => {
  it("renders all class names and 60 min / cupo 7", () => {
    render(<ClassesGallery />);
    ["BARRE", "PILATES MAT", "EXPERIENCE CLASS", "YOGA", "EVENTOS"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument()
    );
    expect(screen.getAllByText(/60 min/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/ClassesGallery.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar ClassesGallery.tsx**

`frontend/src/components/landing/ClassesGallery.tsx`:
```tsx
import { Reveal, MagneticButton } from "@/lib/motion";
import { CLASSES, waLink } from "./data";

const TINTS = ["bg-[#670626] text-[#FFF1F3]", "bg-[#FFF1F3] text-[#2B0911]", "bg-[#FFBDC5] text-[#2B0911]", "bg-[#FFF1F3] text-[#2B0911]", "bg-[#7C0116] text-[#FFF1F3]"];

export function ClassesGallery() {
  return (
    <section id="clases" className="bg-[#FFF1F3]">
      <Reveal className="px-6 pt-20 pb-8 sm:px-10 lg:px-16">
        <h2 className="font-bebas text-[clamp(2.6rem,7vw,6rem)] leading-none tracking-tight text-[#2B0911]">
          LAS CLASES
        </h2>
      </Reveal>
      <div>
        {CLASSES.map((c, i) => (
          <Reveal key={c.key}>
            <article className={`${TINTS[i % TINTS.length]} px-6 py-14 sm:px-10 lg:px-16`}>
              <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="font-alilato text-xs uppercase tracking-[0.24em] opacity-70">{c.n}</span>
                  <h3 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-[0.9] tracking-tight">{c.name}</h3>
                  <p className="font-alilato mt-3 max-w-md opacity-80">{c.blurb}</p>
                  <p className="font-alilato mt-2 text-sm uppercase tracking-[0.18em] opacity-60">60 min · cupo 7</p>
                </div>
                <MagneticButton
                  href={waLink(c.name)}
                  className="press inline-flex w-fit items-center rounded-full border border-current px-7 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em]"
                >
                  Reservar
                </MagneticButton>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/ClassesGallery.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/ClassesGallery.tsx frontend/src/components/landing/ClassesGallery.test.tsx
git commit -m "feat(landing): editorial classes gallery"
```

---

### Task 9: Sección Experience Class

**Files:**
- Create: `frontend/src/components/landing/ExperienceClass.tsx`
- Test: `frontend/src/components/landing/ExperienceClass.test.tsx`

**Interfaces:**
- Consumes: `Reveal` de `@/lib/motion`; `EXPERIENCES` de `./data`; `motion`, `useReducedMotion` de framer-motion.
- Produces: `<ExperienceClass />`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/ExperienceClass.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { ExperienceClass } from "./ExperienceClass";

describe("ExperienceClass", () => {
  it("renders the three experiences", () => {
    render(<ExperienceClass />);
    ["DJ en vivo", "Puppy class", "Candle class"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/ExperienceClass.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar ExperienceClass.tsx**

`frontend/src/components/landing/ExperienceClass.tsx`:
```tsx
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/lib/motion";
import { EXPERIENCES } from "./data";

export function ExperienceClass() {
  const reduce = useReducedMotion();
  return (
    <section className="bg-[#2B0911] px-6 py-20 text-[#FFF1F3] sm:px-10 lg:px-16">
      <Reveal>
        <p className="font-alilato text-xs uppercase tracking-[0.24em] text-[#FFBDC5]">Experience Class</p>
        <h2 className="font-bebas mt-2 text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight">
          NO ES SOLO ENTRENAR
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {EXPERIENCES.map((e) => (
          <motion.div
            key={e.name}
            whileHover={reduce ? undefined : { rotate: -1.5, y: -6 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="rounded-3xl border border-[#FFBDC5]/25 bg-[#670626]/40 p-7"
          >
            <h3 className="font-bebas text-2xl tracking-tight text-[#FFBDC5]">{e.name}</h3>
            <p className="font-alilato mt-2 text-sm opacity-80">{e.note}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/ExperienceClass.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/ExperienceClass.tsx frontend/src/components/landing/ExperienceClass.test.tsx
git commit -m "feat(landing): experience class section"
```

---

### Task 10: Sección Fundadora (Alexandra Murillo)

**Files:**
- Create: `frontend/src/components/landing/FounderSpread.tsx`
- Test: `frontend/src/components/landing/FounderSpread.test.tsx`

**Interfaces:**
- Consumes: `Reveal` de `@/lib/motion`; `FOUNDER` de `./data`; asset `@/assets/pilates-room-images/studio.webp` (placeholder); `motion`, `useScroll`, `useTransform`, `useReducedMotion` de framer-motion.
- Produces: `<FounderSpread />`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/FounderSpread.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { FounderSpread } from "./FounderSpread";

describe("FounderSpread", () => {
  it("renders founder name, role and quote", () => {
    render(<FounderSpread />);
    expect(screen.getByText("Alexandra Murillo")).toBeInTheDocument();
    expect(screen.getByText("Fundadora")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/FounderSpread.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar FounderSpread.tsx**

`frontend/src/components/landing/FounderSpread.tsx`:
```tsx
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { Reveal } from "@/lib/motion";
import { FOUNDER } from "./data";
import founderPhoto from "@/assets/pilates-room-images/studio.webp";

export function FounderSpread() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-8%", reduce ? "-8%" : "8%"]);

  return (
    <section ref={ref} className="grid items-center gap-0 bg-[#FFF1F3] md:grid-cols-2">
      <div className="relative h-[60vh] overflow-hidden md:h-[88vh]">
        <motion.img src={founderPhoto} alt="Alexandra Murillo — Fundadora" style={{ y }} className="absolute inset-0 h-[120%] w-full object-cover" />
      </div>
      <Reveal className="px-6 py-16 sm:px-10 lg:px-16">
        <p className="font-alilato text-xs uppercase tracking-[0.24em] text-[#7C0116]">{FOUNDER.role}</p>
        <h2 className="font-bebas mt-2 text-[clamp(2.4rem,5vw,4.5rem)] leading-none tracking-tight text-[#2B0911]">
          {FOUNDER.name}
        </h2>
        <p className="font-editorial mt-6 text-2xl italic text-[#670626]">“{FOUNDER.quote}”</p>
        <div className="font-alilato mt-6 space-y-4 text-[#2B0911]/80">
          {FOUNDER.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/FounderSpread.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/FounderSpread.tsx frontend/src/components/landing/FounderSpread.test.tsx
git commit -m "feat(landing): founder editorial spread"
```

---

### Task 11: Sección Planes (teaser)

**Files:**
- Create: `frontend/src/components/landing/PlansTeaser.tsx`
- Test: `frontend/src/components/landing/PlansTeaser.test.tsx`

**Interfaces:**
- Consumes: `Reveal`, `MagneticButton` de `@/lib/motion`; `PLANS` de `./data`; `react-router-dom` (`Link`).
- Produces: `<PlansTeaser />`. (Requiere estar dentro de un Router — el test usa `MemoryRouter`.)

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/PlansTeaser.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlansTeaser } from "./PlansTeaser";

describe("PlansTeaser", () => {
  it("renders the 5 plans with prices", () => {
    render(<MemoryRouter><PlansTeaser /></MemoryRouter>);
    expect(screen.getByText("$120")).toBeInTheDocument();
    expect(screen.getByText("$16,000")).toBeInTheDocument();
    expect(screen.getByText(/Membresía mensual/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/PlansTeaser.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar PlansTeaser.tsx**

`frontend/src/components/landing/PlansTeaser.tsx`:
```tsx
import { Link } from "react-router-dom";
import { Reveal } from "@/lib/motion";
import { PLANS } from "./data";

export function PlansTeaser() {
  return (
    <section id="planes" className="bg-[#FFE4E8] px-6 py-20 sm:px-10 lg:px-16">
      <Reveal>
        <h2 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight text-[#2B0911]">PLANES</h2>
        <p className="font-alilato mt-3 max-w-md text-[#2B0911]/70">Elige cómo quieres moverte. Sin permanencia forzada.</p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PLANS.map((p) => (
          <Reveal key={p.name} className="h-full">
            <div className="flex h-full flex-col justify-between rounded-3xl border border-[#F3CCD4] bg-[#FFF7F8] p-6">
              <div>
                <p className="font-alilato text-xs uppercase tracking-[0.18em] text-[#7C0116]">{p.name}</p>
                <p className="font-bebas mt-3 text-4xl tracking-tight text-[#2B0911]">{p.price}</p>
                <p className="font-alilato mt-1 text-sm text-[#2B0911]/60">{p.note}</p>
              </div>
              <Link to="/auth/register" className="press mt-6 inline-flex items-center justify-center rounded-full bg-[#7C0116] px-5 py-3 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]">
                Empezar
              </Link>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/PlansTeaser.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/PlansTeaser.tsx frontend/src/components/landing/PlansTeaser.test.tsx
git commit -m "feat(landing): plans teaser section"
```

---

### Task 12: Sección Contacto + Footer

**Files:**
- Create: `frontend/src/components/landing/ContactFooter.tsx`
- Test: `frontend/src/components/landing/ContactFooter.test.tsx`

**Interfaces:**
- Consumes: `Reveal`, `MagneticButton` de `@/lib/motion`; `STUDIO`, `waLink` de `./data`.
- Produces: `<ContactFooter />` con `id="contacto"`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/components/landing/ContactFooter.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { ContactFooter } from "./ContactFooter";

describe("ContactFooter", () => {
  it("shows address, IG handle and a WhatsApp CTA", () => {
    render(<ContactFooter />);
    expect(screen.getByText(/Nápoles/)).toBeInTheDocument();
    expect(screen.getByText("@varre.studio")).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/components/landing/ContactFooter.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar ContactFooter.tsx**

`frontend/src/components/landing/ContactFooter.tsx`:
```tsx
import { Reveal, MagneticButton } from "@/lib/motion";
import { STUDIO, waLink } from "./data";

export function ContactFooter() {
  return (
    <footer id="contacto" className="bg-[#670626] px-6 py-16 text-[#FFF1F3] sm:px-10 lg:px-16">
      <Reveal className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-bebas text-[clamp(2.4rem,6vw,5rem)] leading-none tracking-tight">VEN A VARRE24</h2>
            <p className="font-alilato mt-4 max-w-sm text-[#E8DED4]">{STUDIO.address}</p>
            <a href={STUDIO.instagramUrl} className="font-alilato mt-2 inline-block text-[#FFBDC5]">{STUDIO.instagram}</a>
            <div className="mt-6">
              <MagneticButton href={waLink("una clase")} className="press inline-flex items-center rounded-full bg-[#7C0116] px-7 py-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#FFF1F3]">
                Reservar por WhatsApp
              </MagneticButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[#FFBDC5]/20">
            <iframe
              title="Mapa VARRE24 — Nápoles, CDMX"
              src={`https://www.google.com/maps?q=${STUDIO.mapsQuery}&output=embed`}
              className="h-64 w-full md:h-full"
              loading="lazy"
            />
          </div>
        </div>
        <div className="font-alilato mt-12 flex flex-col items-start justify-between gap-2 border-t border-[#FFBDC5]/15 pt-6 text-xs text-[#E8DED4]/70 sm:flex-row">
          <span>© {new Date().getFullYear()} VARRE24 · Barre &amp; Pilates · CDMX</span>
          <span>Movimiento · Intención · Elegancia · Constancia</span>
        </div>
      </Reveal>
    </footer>
  );
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test --workspace frontend -- src/components/landing/ContactFooter.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/ContactFooter.tsx frontend/src/components/landing/ContactFooter.test.tsx
git commit -m "feat(landing): contact + footer section"
```

---

### Task 13: Nav + orquestador Index.tsx

**Files:**
- Create: `frontend/src/components/landing/Nav.tsx`
- Replace: `frontend/src/pages/Index.tsx`
- Test: `frontend/src/pages/Index.test.tsx`

**Interfaces:**
- Consumes: todas las secciones de `@/components/landing/*`; `react-router-dom` (`Link`).
- Produces: `<Index />` (default export) y `<Nav />`.

- [ ] **Step 1: Escribir el test (falla)**

`frontend/src/pages/Index.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Index from "./Index";

describe("Index landing", () => {
  it("composes hero, classes and footer", () => {
    render(<MemoryRouter><Index /></MemoryRouter>);
    expect(screen.getByText(/BARRE/)).toBeInTheDocument();
    expect(screen.getByText("PILATES MAT")).toBeInTheDocument();
    expect(screen.getByText("Alexandra Murillo")).toBeInTheDocument();
    expect(screen.getByText(/VEN A VARRE24/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test (verifica que falla)**

Run: `npm test --workspace frontend -- src/pages/Index.test.tsx`
Expected: FAIL (el Index viejo no tiene "VEN A VARRE24").

- [ ] **Step 3: Implementar Nav.tsx**

`frontend/src/components/landing/Nav.tsx`:
```tsx
import { Link } from "react-router-dom";

const LINKS = [
  { label: "Clases", href: "#clases" },
  { label: "Experience", href: "#contacto" },
  { label: "Planes", href: "#planes" },
  { label: "Contacto", href: "#contacto" },
];

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-10">
        <a href="#" className="font-bebas text-2xl tracking-tight text-[#FFF1F3] mix-blend-difference">VARRE24</a>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="font-alilato text-sm text-[#FFF1F3] mix-blend-difference">{l.label}</a>
          ))}
        </div>
        <Link to="/auth/login" className="press rounded-full bg-[#7C0116] px-5 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#FFF1F3]">
          Entrar
        </Link>
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Reemplazar Index.tsx por el orquestador**

`frontend/src/pages/Index.tsx` (reemplazo completo):
```tsx
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { ClassesGallery } from "@/components/landing/ClassesGallery";
import { ExperienceClass } from "@/components/landing/ExperienceClass";
import { FounderSpread } from "@/components/landing/FounderSpread";
import { PlansTeaser } from "@/components/landing/PlansTeaser";
import { ContactFooter } from "@/components/landing/ContactFooter";

export default function Index() {
  return (
    <div className="bg-[#FFF1F3]">
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <ClassesGallery />
        <ExperienceClass />
        <FounderSpread />
        <PlansTeaser />
        <ContactFooter />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Correr el test + build**

Run:
```bash
npm test --workspace frontend -- src/pages/Index.test.tsx
npm run build --workspace frontend
```
Expected: test PASS; build verde.

- [ ] **Step 6: Verificación visual (screenshot)**

Run:
```bash
npm run build --workspace frontend && (cd frontend && npx vite preview --port 4173 &) && sleep 3
```
Luego navegar con Playwright a `http://localhost:4173/` y tomar screenshot (viewport + reload). Confirmar: hero "BARRE & PILATES" con paleta cherry/claret, marquee, clases editoriales, fundadora, planes, footer claret. Detener el preview.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/landing/Nav.tsx frontend/src/pages/Index.tsx frontend/src/pages/Index.test.tsx
git commit -m "feat(landing): nav + Index orchestrator (new editorial landing)"
```

---

### Task 14: Pulido de movimiento, reduced-motion y verificación final

**Files:**
- Modify: secciones según hallazgos del review (solo ajustes de animación, sin cambiar contenido).
- Test: re-corre toda la suite.

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Review de animaciones con la skill**

Usar la skill `emil-design-eng` / `review-animations` (en `.agents/skills/`) y `design-taste` para revisar timings, easings y jerarquía de movimiento del landing. Ajustar duraciones/stagger donde el review lo indique (solo `transform`/`opacity`).

- [ ] **Step 2: Verificar reduced-motion**

Run:
```bash
npm run build --workspace frontend && (cd frontend && npx vite preview --port 4173 &) && sleep 3
```
Con Playwright, emular `prefers-reduced-motion: reduce` y navegar a `/`; confirmar que el contenido aparece sin animación (sin parallax, sin marquee en movimiento, headings visibles). Detener preview.

- [ ] **Step 3: Suite completa de tests + build**

Run:
```bash
npm test --workspace frontend
npm run build --workspace frontend
```
Expected: todos los tests PASS; build verde.

- [ ] **Step 4: No-regresión portal/admin**

Run:
```bash
(cd frontend && npx vite preview --port 4173 &) && sleep 3 && for p in / /app /admin/dashboard /auth/login; do curl -s -o /dev/null -w "$p -> %{http_code}\n" http://localhost:4173$p; done
```
Expected: todos `200`. Detener preview.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "polish(landing): motion review, reduced-motion + final verification"
```

---

## Self-Review (cobertura de la spec)

- **Concepto Editorial A+B** → Tasks 6–13 (hero cinemático + secciones editoriales + marquee).
- **7 secciones con contenido real** → Tasks 5–12 (data + Hero, Manifesto, ClassesGallery, ExperienceClass, FounderSpread, PlansTeaser, ContactFooter).
- **Sistema de movimiento + primitivas reutilizables** → Tasks 2–3 (variants, Reveal, MagneticButton, Marquee, KineticHeading).
- **Transiciones de página globales (landing/portal/admin)** → Task 4 (AnimatedRoutes + App.tsx).
- **Paleta Red Pink Bold + Anton/Inter Tight/Fraunces** → Global Constraints, aplicado en cada sección (clases `font-bebas`/`font-editorial`, brand hex).
- **prefers-reduced-motion** → primitivas con `useReducedMotion` (Tasks 2–4) + verificación Task 14.
- **No romper portal/admin** → Task 4 step 6 + Task 14 step 4.
- **Assets placeholder flagged** → Tasks 6 y 10 (notas de reemplazo).
- **Build verde + tests** → cada tarea termina en verificación + commit.

Sin placeholders pendientes; tipos/firmas consistentes entre tareas (primitivas declaradas en Tasks 2–4 y consumidas por nombre/firma en 6–13).
