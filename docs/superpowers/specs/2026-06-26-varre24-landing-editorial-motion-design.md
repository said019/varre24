# VARRE24 — Rediseño del landing "Editorial en movimiento" + sistema de movimiento global

**Fecha:** 2026-06-26
**Estado:** Aprobado (estructura + plan de movimiento). Pendiente de plan de implementación.
**Relacionado:** [2026-06-26-varre24-rebrand-design.md](./2026-06-26-varre24-rebrand-design.md) (rebrand base, paleta Red Pink Bold).

## Contexto

El sistema de reservas de VARRE24 (rebrand de `pilates-room`) ya tiene la paleta oficial
**Red Pink Bold** (Cherry Cola `#7C0116` · Claret `#670626` · Pink `#FFBDC5` · Hibiscus
`#E0A4B0`) y tipografía Anton (display) + Inter Tight (cuerpo) + Fraunces (editorial).

Problema: el **landing** sigue siendo, en estructura, una copia del proyecto anterior
(Pilates Room) — layout "wellness suave". El usuario quiere algo **único, no repetitivo**,
y **con movimiento en todo el sistema**.

Referencia real de marca/contenido: **varre24fit.com** (sitio actual del studio, Next.js).
De ahí salen el contenido y el "feel" (no la paleta — esa es Red Pink Bold, decisión del
usuario). El sitio real hoy solo enlaza a WhatsApp; no tiene sistema de reservas (por eso
migran al nuestro).

## Decisiones tomadas (alineadas con el usuario)

1. **Marca oficial = Red Pink Bold** (deck del usuario), no la paleta taupe/espresso del
   sitio actual. Se conserva lo ya tokenizado.
2. **Alcance:** rediseñar **solo el landing público** (único, memorable) + aplicar un
   **sistema de movimiento global** (transiciones de página, hovers, micro-interacciones)
   a portal cliente y admin **sin** rehacer cada pantalla.
3. **Dirección creativa: Mezcla A+B** — "Editorial en movimiento" (revista de moda bold:
   Anton gigante, bloques a sangre, numeración N°01…) con respiraciones **cinematográficas**
   (hero con parallax, transiciones suaves, aire crema). Audaz y elegante.
4. **Motion stack:** Framer Motion (`motion/react`) + scroll-driven. Recomendado por las
   skills de Emil Kowalski; primitivas compartidas reutilizables.
5. **Fotos/logos:** se usan los assets actuales como placeholder hasta que el usuario
   entregue los de VARRE24. La foto de hero actual trae texto "IN MY PILATES ERA" horneado
   → debe reemplazarse.

## Contenido real (de varre24fit.com)

- **Identidad:** estudio boutique de **Barre y Pilates** en Nápoles, CDMX. Fundadora:
  **Alexandra Murillo**. Voz: movimiento con *intención, elegancia y constancia*;
  entrenamiento consciente; acompañamiento y ritmo propio.
- **Clases:**
  - **BARRE** — ballet + fuerza + resistencia; tonifica cuerpo y postura.
  - **PILATES MAT** — fuerza profunda, control y equilibrio desde el centro.
  - **EXPERIENCE CLASS** — experiencias temáticas: *DJ en vivo · Puppy class · Candle class*.
  - **YOGA** — flexibilidad y equilibrio.
  - **EVENTOS** — privados / especiales.
  - Reglas: **60 min**, **cupo 7** en clases regulares.
- **Planes (MXN):** $120 prueba · $270 individual · $500 paquete 4 · $990 mensual ·
  $16,000 ilimitado 6 meses.
- **Canales:** WhatsApp +1 773 648 9987 · Instagram @varre.studio · Facebook.
- **Dirección:** Arizona 14, Piso 3, Col. Nápoles, Benito Juárez, CDMX.

## Arquitectura del landing (componentes)

Reemplazar `frontend/src/pages/Index.tsx` por una composición de secciones en
`frontend/src/components/landing/`. Cada sección es una unidad aislada (una responsabilidad,
props claras, testeable de forma independiente):

| # | Componente | Propósito | Movimiento |
|---|-----------|-----------|-----------|
| 1 | `Hero.tsx` | Portada cinemática a sangre | Foto + overlay claret con **parallax**; "BARRE & PILATES" en Anton con **kinetic reveal** (clip/mask); eyebrow + CTA cherry "Reserva tu clase" / "Conoce el método"; scroll cue. |
| 2 | `Manifesto.tsx` | Cinta de valores | **Marquee** infinito "MOVIMIENTO · INTENCIÓN · ELEGANCIA · CONSTANCIA"; transición de color cherry→crema al entrar. |
| 3 | `ClassesGallery.tsx` | Las 5 clases | Galería **pinned/horizontal** al scroll; cada clase = panel a sangre con foto, Anton grande, "60 min · cupo 7", N°0x, CTA Reservar; color alterna claret/crema/pink. |
| 4 | `ExperienceClass.tsx` | Lado social | DJ en vivo · Puppy · Candle como tarjetas con **hover tilt**; pink/hibiscus. |
| 5 | `FounderSpread.tsx` | Alexandra Murillo | Spread editorial: foto con **parallax** + copy real + quote en Fraunces italic. |
| 6 | `PlansTeaser.tsx` | Precios | Tarjetas editoriales con los 5 planes; CTA a registro/checkout real del sistema. |
| 7 | `ContactFooter.tsx` | Cierre | Mapa Nápoles, horario base, WhatsApp, IG @varre.studio; footer claret con wordmark gigante. |

`Index.tsx` queda como orquestador delgado que ensambla las 7 secciones + el nav sticky.

## Sistema de movimiento global

Primitivas compartidas en `frontend/src/lib/motion/` (reutilizadas por el landing **y** por
portal/admin):

- `variants.ts` — variants estándar: `fadeUp`, `fade`, `staggerContainer`, `scaleIn`.
- `PageTransition.tsx` — envoltura con `AnimatePresence` para transiciones de ruta.
- `Reveal.tsx` — reveal al entrar al viewport (`whileInView`, con stagger opcional).
- `MagneticButton.tsx` — CTA con atracción magnética + press spring.
- `Marquee.tsx` — cinta infinita reutilizable.
- `PinnedGallery.tsx` — galería con scroll pinned/horizontal.
- `KineticHeading.tsx` — titular Anton con reveal por máscara/clip.

**Global:** envolver los outlets del router en `App.tsx` con `AnimatePresence` (key =
location) → transiciones de página suaves en landing, `/app/*` (portal) y `/admin/*`. Las
micro-interacciones (botón press, card lift) se aplican vía las primitivas/clases existentes
sin rehacer cada pantalla.

**Accesibilidad/perf:** respetar `prefers-reduced-motion` (ya hay base en `index.css`);
animar solo `transform`/`opacity`; `will-change` puntual; lazy-load de secciones pesadas.

## Implementación (resumen; el detalle va en el plan)

1. Agregar dependencia `framer-motion` al workspace `frontend`.
2. Crear las primitivas en `src/lib/motion/`.
3. Construir las 7 secciones del landing (una a una, verificables).
4. Reemplazar `Index.tsx` por el orquestador.
5. Cablear `AnimatePresence` global en `App.tsx` (transiciones de ruta).
6. Verificar: `npm run build` verde, screenshot del landing, prueba con
   `prefers-reduced-motion`, y que portal/admin sigan funcionando con las transiciones.
7. Usar las skills `emil-design-eng` (review-animations) y `design-taste` para el pulido.

## Fuera de alcance

- Rediseño visual pantalla-por-pantalla de portal/admin (solo reciben el movimiento global).
- Backend, pagos, integraciones.
- Assets definitivos (logo, fotos, video) — se usan placeholders y se marcan los pendientes.

## Criterios de éxito

- Build del frontend verde; sin romper portal/admin.
- Landing refleja el concepto A+B (editorial bold + cinematográfico) con la paleta Red Pink
  Bold y contenido real de varre24fit.com.
- Movimiento fluido (~60fps, solo transform/opacity) y `prefers-reduced-motion` respetado.
- Transiciones de página activas globalmente (landing + portal + admin).
- Se siente **único** — claramente distinto del layout de Pilates Room.

## Pendiente del usuario (no bloquea construir)

Logo VARRE24, fotos/video del studio (la actual trae texto horneado), confirmación de
dominio/email/redes reales, y si YOGA/EVENTOS van con el mismo peso que Barre/Pilates.
