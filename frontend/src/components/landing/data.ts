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

export interface Plan {
  name: string;
  price: string;
  unit?: string;
  note: string;
  detail: string;
  featured?: boolean;
  tag?: string;
}

export const PLANS: Plan[] = [
  { name: "Clase de prueba", price: "$120", unit: "MXN", note: "Solo tu primera vez", detail: "1 clase · vigencia 7 días", tag: "Prueba" },
  { name: "Clase individual", price: "$270", unit: "MXN", note: "Suelta, cuando quieras", detail: "1 crédito · vigencia 30 días" },
  { name: "Paquete 4 clases", price: "$500", unit: "MXN", note: "Tu ritmo semanal", detail: "4 clases · vigencia 30 días" },
  { name: "Membresía mensual", price: "$990", unit: "MXN", note: "Hasta 3 por semana", detail: "12 clases al mes · reserva anticipada", featured: true, tag: "Más elegida" },
  { name: "Ilimitado 6 meses", price: "$16,000", unit: "MXN", note: "Sin límites", detail: "Clases ilimitadas · vigencia 180 días" },
];

export function waLink(clase: string): string {
  const text = `Hola 🤍\nMe gustaría reservar una clase de ${clase}\n\n¿Me pueden compartir paquetes y horarios disponibles?\nGracias ✨`;
  return `https://wa.me/${STUDIO.whatsapp}?text=${encodeURIComponent(text)}`;
}
