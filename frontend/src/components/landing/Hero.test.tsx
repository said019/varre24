import { render, screen } from "@testing-library/react";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("renders the centered brand logo and subtitle", () => {
    render(<Hero />);
    expect(screen.getByAltText("VARRE24")).toBeInTheDocument();
    expect(screen.getByText(/Barre & Pilates/i)).toBeInTheDocument();
  });
});
