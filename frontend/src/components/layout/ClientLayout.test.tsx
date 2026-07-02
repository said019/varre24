import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClientLayout from "./ClientLayout";

describe("ClientLayout", () => {
  it("renders app content without the decorative photo accent", () => {
    render(
      <MemoryRouter>
        <ClientLayout>
          <section>Panel de clienta</section>
        </ClientLayout>
      </MemoryRouter>,
    );

    // La banda decorativa (client-photo-accent) se retiró a pedido del studio:
    // el contenido debe empezar limpio, sin franja de foto arriba.
    expect(screen.queryByTestId("client-photo-accent")).not.toBeInTheDocument();
    expect(screen.getByText("Panel de clienta")).toBeInTheDocument();
  });
});
