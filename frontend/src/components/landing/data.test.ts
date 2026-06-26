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
