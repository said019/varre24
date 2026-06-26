import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("shows the wordmark headline and a reserve CTA", () => {
    render(<Hero />);
    expect(screen.getByText(/BARRE/)).toBeInTheDocument();
    expect(screen.getByText(/Reserva tu clase/i)).toBeInTheDocument();
    expect(screen.getByText(/Nápoles/)).toBeInTheDocument();
  });
});
