import heroStudio from "@/assets/varre24/inauguracion/hero-studio.webp";
import communityGroup from "@/assets/varre24/inauguracion/community-group.webp";
import communityRitual from "@/assets/varre24/inauguracion/community-ritual.webp";
import communityDetail from "@/assets/varre24/inauguracion/community-detail.webp";
import communityFlow from "@/assets/varre24/inauguracion/community-flow.webp";
import barreAction from "@/assets/varre24/inauguracion/barre-action.webp";
import pilatesFlow from "@/assets/varre24/inauguracion/pilates-flow.webp";
import experienceWelcome from "@/assets/varre24/inauguracion/experience-welcome.webp";
import yogaBreath from "@/assets/varre24/inauguracion/yoga-breath.webp";
import eventosGroup from "@/assets/varre24/inauguracion/eventos-group.webp";
import experienceDj from "@/assets/varre24/inauguracion/experience-dj.webp";
import experienceDetail from "@/assets/varre24/inauguracion/experience-detail.webp";
import experienceCandle from "@/assets/varre24/inauguracion/experience-candle.webp";
import authStudio from "@/assets/varre24/inauguracion/auth-studio.webp";
import clientAccent from "@/assets/varre24/inauguracion/client-accent.webp";
import adminAccent from "@/assets/varre24/inauguracion/admin-accent.webp";

export type PhotoAsset = {
  src: string;
  alt: string;
};

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
    src: pilatesFlow,
    alt: "Pilates mat VARRE24 con pelota de estabilidad",
  },
  experience: {
    src: experienceWelcome,
    alt: "Experience Class VARRE24 con detalle de bienvenida",
  },
  yoga: {
    src: yogaBreath,
    alt: "Practica consciente VARRE24 con respiracion y calma",
  },
  eventos: {
    src: eventosGroup,
    alt: "Evento privado VARRE24 con comunidad en el estudio",
  },
} as const satisfies Record<string, PhotoAsset>;

export const EXPERIENCE_PHOTOS = [
  {
    src: experienceDj,
    alt: "Experience Class VARRE24 con DJ en vivo",
  },
  {
    src: experienceDetail,
    alt: "Clase especial VARRE24 con flores y bebida de bienvenida",
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
