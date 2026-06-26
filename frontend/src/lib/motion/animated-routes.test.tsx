import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AnimatedRoutes } from "./AnimatedRoutes";

describe("AnimatedRoutes", () => {
  it("renders the matched route inside the transition wrapper", () => {
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <AnimatedRoutes>
          <Routes>
            <Route path="/x" element={<p>página X</p>} />
          </Routes>
        </AnimatedRoutes>
      </MemoryRouter>
    );
    expect(screen.getByText("página X")).toBeInTheDocument();
  });
});
