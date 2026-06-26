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
