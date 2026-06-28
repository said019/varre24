import { render, screen } from "@testing-library/react";
import { ExperienceClass } from "./ExperienceClass";

describe("ExperienceClass", () => {
  it("renders the three experiences", () => {
    render(<ExperienceClass />);
    ["DJ en vivo", "Puppy class", "Candle class"].forEach((n) =>
      expect(screen.getByText(n)).toBeInTheDocument()
    );
    expect(screen.getAllByRole("img", { name: /Experience Class|clase especial|Candle/i })).toHaveLength(3);
  });
});
