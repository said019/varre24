import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClientLayout from "./ClientLayout";

describe("ClientLayout", () => {
  it("includes a soft studio photo accent without replacing app content", () => {
    render(
      <MemoryRouter>
        <ClientLayout>
          <section>Panel de clienta</section>
        </ClientLayout>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("client-photo-accent")).toBeInTheDocument();
    expect(screen.getByText("Panel de clienta")).toBeInTheDocument();
  });
});
