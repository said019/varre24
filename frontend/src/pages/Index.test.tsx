import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Index from "./Index";

describe("Index landing", () => {
  it("composes hero, classes and footer", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Index /></MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getAllByText(/BARRE/).length).toBeGreaterThan(0);
    expect(screen.getByText("PILATES MAT")).toBeInTheDocument();
    expect(screen.getByText("Comunidad VARRE24")).toBeInTheDocument();
    expect(screen.getByText("Alexandra Murillo")).toBeInTheDocument();
    expect(screen.getByText(/Ven a VARRE24/i)).toBeInTheDocument();
  });
});
