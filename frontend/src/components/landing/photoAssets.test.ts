import { CLASS_PHOTOS, EXPERIENCE_PHOTOS, LANDING_PHOTOS, SHELL_PHOTOS } from "./photoAssets";

describe("photoAssets", () => {
  it("exposes curated inauguration photography for the landing and app shells", () => {
    expect(LANDING_PHOTOS.hero.alt).toMatch(/VARRE24/i);
    expect(LANDING_PHOTOS.community).toHaveLength(4);
    expect(Object.keys(CLASS_PHOTOS)).toEqual(["barre", "pilates", "experience", "yoga", "eventos"]);
    expect(EXPERIENCE_PHOTOS).toHaveLength(3);
    expect(SHELL_PHOTOS.auth.alt).toMatch(/espejos/i);
  });
});
