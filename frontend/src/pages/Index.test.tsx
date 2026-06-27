import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Index from "./Index";

describe("Index landing", () => {
  it("composes hero, classes and footer", () => {
    render(<MemoryRouter><Index /></MemoryRouter>);
    expect(screen.getAllByText(/BARRE/).length).toBeGreaterThan(0);
    expect(screen.getByText("PILATES MAT")).toBeInTheDocument();
    expect(screen.getByText("Alexandra Murillo")).toBeInTheDocument();
    expect(screen.getByText(/Ven a VARRE24/i)).toBeInTheDocument();
  });
});
