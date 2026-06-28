import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  it("frames auth screens with studio photography", () => {
    render(
      <MemoryRouter>
        <AuthLayout heading={<h1>Entrar</h1>}>
          <form aria-label="Formulario de acceso" />
        </AuthLayout>
      </MemoryRouter>,
    );

    expect(screen.getByAltText(/sala de espejos VARRE24/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Formulario de acceso")).toBeInTheDocument();
  });
});
