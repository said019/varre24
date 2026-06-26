import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlansTeaser } from "./PlansTeaser";

describe("PlansTeaser", () => {
  it("renders the 5 plans with prices", () => {
    render(<MemoryRouter><PlansTeaser /></MemoryRouter>);
    expect(screen.getByText("$120")).toBeInTheDocument();
    expect(screen.getByText("$16,000")).toBeInTheDocument();
    expect(screen.getByText(/Membresía mensual/)).toBeInTheDocument();
    expect(screen.getByText("$270")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$990")).toBeInTheDocument();
  });
});
