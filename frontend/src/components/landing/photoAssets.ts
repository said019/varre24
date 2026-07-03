import heroStudio from "@/assets/varre24/inauguracion/hero-studio.webp";
import communityGroup from "@/assets/varre24/inauguracion/community-group.webp";
import communityRitual from "@/assets/varre24/inauguracion/community-ritual.webp";
import communityDetail from "@/assets/varre24/inauguracion/community-detail.webp";
import communityFlow from "@/assets/varre24/inauguracion/community-flow.webp";
import barreAction from "@/assets/varre24/inauguracion/barre-action.webp";
import yogaBreath from "@/assets/varre24/inauguracion/yoga-breath.webp";
import eventosVarre from "@/assets/varre24/inauguracion/eventos-varre.jpg";
import experienceDj from "@/assets/varre24/inauguracion/experience-dj.webp";
import experienceCandle from "@/assets/varre24/inauguracion/experience-candle.webp";
import authStudio from "@/assets/varre24/inauguracion/auth-studio.webp";
import clientAccent from "@/assets/varre24/inauguracion/client-accent.webp";
import adminAccent from "@/assets/varre24/inauguracion/admin-accent.webp";
import founderReady from "@/assets/varre24/editorial/founder-ready.webp";
import experienceStretch from "@/assets/varre24/editorial/experience-stretch.webp";
import pilatesDuoBall from "@/assets/varre24/editorial/pilates-duo-ball.webp";
import authLoginStretch from "@/assets/varre24/editorial/auth-login-stretch.webp";
import authRegisterLegs from "@/assets/varre24/editorial/auth-register-legs.webp";
import authForgotMat from "@/assets/varre24/editorial/auth-forgot-mat.webp";
import authResetRing from "@/assets/varre24/editorial/auth-reset-ring.webp";

export type PhotoAsset = {
  src: string;
  alt: string;
};

export const FOUNDER_PHOTO = {
  src: founderReady,
  alt: "Pies con flores y letrero ready de VARRE24",
} as const satisfies PhotoAsset;

export const LANDING_PHOTOS = {
  hero: {
    src: heroStudio,
    alt: "Clase grupal de barre y pilates en el estudio VARRE24",
  },
  community: [
    {
      src: communityGroup,
      alt: "Comunidad VARRE24 reunida despues de una clase especial",
    },
    {
      src: communityRitual,
      alt: "Comunidad VARRE24 respirando durante la inauguracion",
    },
    {
      src: communityDetail,
      alt: "Detalle de bienvenida VARRE24 con liston rosa y vela",
    },
    {
      src: communityFlow,
      alt: "Clase VARRE24 con pelotas y espejos del estudio",
    },
  ],
} as const satisfies {
  hero: PhotoAsset;
  community: readonly PhotoAsset[];
};

export const CLASS_PHOTOS = {
  barre: {
    src: barreAction,
    alt: "Clase de barre VARRE24 frente al espejo",
  },
  pilates: {
    src: pilatesDuoBall,
    alt: "Pilates mat VARRE24 con dos alumnas y pelota entre las piernas",
  },
  experience: {
    src: experienceStretch,
    alt: "Experience Class VARRE24 con flores y estiramiento en mat negro",
  },
  yoga: {
    src: yogaBreath,
    alt: "Practica consciente VARRE24 con respiracion y calma",
  },
  eventos: {
    src: eventosVarre,
    alt: "Evento privado de cumpleaños en el estudio VARRE24",
  },
} as const satisfies Record<string, PhotoAsset>;

// Orden 1:1 con EXPERIENCES en data.ts (DJ en vivo, Puppy class, Candle class).
// La foto de flores + mat negro se quitó de aquí: ya la usa CLASS_PHOTOS.experience
// en ClassesGallery, y repetida en esta sección se veía duplicada en la misma página.
export const EXPERIENCE_PHOTOS = [
  {
    src: experienceDj,
    alt: "Experience Class VARRE24 con DJ en vivo",
  },
  {
    src: authRegisterLegs,
    alt: "Movimiento en grupo VARRE24 — Puppy class",
  },
  {
    src: experienceCandle,
    alt: "Candle class VARRE24 con flores y vela",
  },
] as const satisfies readonly PhotoAsset[];

export const SHELL_PHOTOS = {
  auth: {
    src: authStudio,
    alt: "Clase grupal en sala de espejos VARRE24",
  },
  client: {
    src: clientAccent,
    alt: "Detalle de bienvenida VARRE24",
  },
  admin: {
    src: adminAccent,
    alt: "Equipo de estudio VARRE24",
  },
} as const satisfies Record<string, PhotoAsset>;

// Una foto distinta por pantalla del flujo de autenticación — login, registro,
// recuperar y restablecer contraseña ya no comparten la misma imagen.
export const AUTH_PHOTOS = {
  login: {
    src: authLoginStretch,
    alt: "Alumna VARRE24 estirando con aro de pilates",
  },
  register: {
    src: authRegisterLegs,
    alt: "Alumna VARRE24 en ejercicio de piernas con aro de pilates",
  },
  forgot: {
    src: authForgotMat,
    alt: "Detalle de alumna VARRE24 enrollando el mat",
  },
  reset: {
    src: authResetRing,
    alt: "Alumna VARRE24 sentada con aro de pilates",
  },
} as const satisfies Record<string, PhotoAsset>;
