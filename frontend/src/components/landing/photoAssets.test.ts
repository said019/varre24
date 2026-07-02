import { CLASS_PHOTOS, EXPERIENCE_PHOTOS, FOUNDER_PHOTO, LANDING_PHOTOS, SHELL_PHOTOS } from "./photoAssets";

describe("photoAssets", () => {
  it("exposes curated inauguration photography for the landing and app shells", () => {
    expect(LANDING_PHOTOS.hero.alt).toMatch(/VARRE24/i);
    expect(LANDING_PHOTOS.community).toHaveLength(4);
    expect(FOUNDER_PHOTO.alt).toMatch(/ready/i);
    expect(Object.keys(CLASS_PHOTOS)).toEqual(["barre", "pilates", "experience", "yoga", "eventos"]);
    expect(CLASS_PHOTOS.pilates.alt).toMatch(/dos alumnas|pelota/i);
    expect(CLASS_PHOTOS.experience.alt).toMatch(/mat negro/i);
    expect(EXPERIENCE_PHOTOS).toHaveLength(3);
    expect(EXPERIENCE_PHOTOS[0].alt).toMatch(/mat negro/i);
    expect(SHELL_PHOTOS.auth.alt).toMatch(/espejos/i);
  });
});
