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
