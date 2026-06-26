import { render, screen } from "@testing-library/react";
import { ClassesGallery } from "./ClassesGallery";

describe("ClassesGallery", () => {
  it("renders all class names and 60 min / cupo 7", () => {
    render(<ClassesGallery />);
    ["BARRE", "PILATES MAT", "EXPERIENCE CLASS", "YOGA", "EVENTOS"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument()
    );
    expect(screen.getAllByText(/60 min/).length).toBeGreaterThan(0);
  });
});
