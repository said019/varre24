import { render, screen } from "@testing-library/react";
import { FounderSpread } from "./FounderSpread";

describe("FounderSpread", () => {
  it("renders founder name, role and quote", () => {
    render(<FounderSpread />);
    expect(screen.getByAltText(/ready/i)).toBeInTheDocument();
    expect(screen.getByText("Alexandra Murillo")).toBeInTheDocument();
    expect(screen.getByText("Fundadora")).toBeInTheDocument();
    expect(screen.getByText(/El movimiento se vive con intención/)).toBeInTheDocument();
  });
});
