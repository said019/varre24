export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Posición del encuadre relativa al lado del recorte. Por ejemplo, x=0.1
 * desplaza la foto 10% a la derecha dentro del marco.
 */
export interface SquareCrop {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_SQUARE_CROP: SquareCrop = { x: 0, y: 0, zoom: 1 };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen"));
    image.src = url;
  });
}

async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function getImageDimensions(file: File): Promise<ImageDimensions> {
  const image = await loadImageFile(file);
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

export function getSquareCropBounds(
  dimensions: ImageDimensions,
  zoom: number,
): Pick<SquareCrop, "x" | "y"> {
  const safeZoom = Math.max(1, zoom);
  const baseWidth = Math.max(1, dimensions.width / dimensions.height);
  const baseHeight = Math.max(1, dimensions.height / dimensions.width);

  return {
    x: Math.max(0, (baseWidth * safeZoom - 1) / 2),
    y: Math.max(0, (baseHeight * safeZoom - 1) / 2),
  };
}

export function clampSquareCrop(crop: SquareCrop, dimensions: ImageDimensions): SquareCrop {
  const zoom = Math.max(1, Math.min(3, Number.isFinite(crop.zoom) ? crop.zoom : 1));
  const bounds = getSquareCropBounds(dimensions, zoom);
  return {
    zoom,
    x: Math.max(-bounds.x, Math.min(bounds.x, Number.isFinite(crop.x) ? crop.x : 0)),
    y: Math.max(-bounds.y, Math.min(bounds.y, Number.isFinite(crop.y) ? crop.y : 0)),
  };
}

export async function cropImageToSquare(
  file: File,
  crop: SquareCrop,
  options: { size?: number; quality?: number } = {},
): Promise<File> {
  const size = options.size ?? 720;
  const quality = options.quality ?? 0.88;
  const image = await loadImageFile(file);
  const dimensions = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  const safeCrop = clampSquareCrop(crop, dimensions);
  const scale = Math.max(size / dimensions.width, size / dimensions.height) * safeCrop.zoom;
  const drawnWidth = dimensions.width * scale;
  const drawnHeight = dimensions.height * scale;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas no disponible");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    (size - drawnWidth) / 2 + safeCrop.x * size,
    (size - drawnHeight) / 2 + safeCrop.y * size,
    drawnWidth,
    drawnHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("No se pudo encuadrar la imagen"))),
      "image/jpeg",
      quality,
    );
  });

  return new File([blob], "foto-perfil.jpg", { type: "image/jpeg", lastModified: Date.now() });
}

export async function optimizeImage(
  file: File,
  options: OptimizeImageOptions = {},
): Promise<Blob> {
  const { maxWidth = 1600, maxHeight = 1600, quality = 0.9, mimeType = "image/jpeg" } = options;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Error al leer archivo"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Error al cargar imagen"));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))),
      mimeType,
      quality,
    );
  });
}
