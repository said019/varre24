import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClassesGallery } from "./ClassesGallery";

describe("ClassesGallery", () => {
  it("renders all class names and 60 min / cupo 7", () => {
    render(<MemoryRouter><ClassesGallery /></MemoryRouter>);
    ["BARRE", "PILATES MAT", "EXPERIENCE CLASS", "YOGA", "EVENTOS"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument()
    );
    expect(screen.getAllByText(/60 min/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cupo 7/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: /VARRE24/i })).toHaveLength(5);
  });
});
