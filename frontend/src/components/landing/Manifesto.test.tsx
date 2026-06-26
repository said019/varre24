import { render, screen } from "@testing-library/react";
import { Manifesto } from "./Manifesto";

describe("Manifesto", () => {
  it("renders manifesto words", () => {
    render(<Manifesto />);
    expect(screen.getAllByText(/MOVIMIENTO/).length).toBeGreaterThan(0);
  });
});
