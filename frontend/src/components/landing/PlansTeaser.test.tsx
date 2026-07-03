import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { PlansTeaser } from "./PlansTeaser";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));

const LIVE_PLANS = [
  { name: "Clase de prueba", price: 120, currency: "MXN", classLimit: 1, durationDays: 7 },
  { name: "Clase individual", price: 270, currency: "MXN", classLimit: 1, durationDays: 30 },
  { name: "Paquete 4 clases", price: 500, currency: "MXN", classLimit: 4, durationDays: 30 },
  { name: "Membresía mensual", price: 990, currency: "MXN", classLimit: 12, durationDays: 30 },
  { name: "Ilimitado 6 meses", price: 16000, currency: "MXN", classLimit: null, durationDays: 180 },
];

describe("PlansTeaser", () => {
  it("renders live prices from /api/plans (not a hardcoded bundle value)", async () => {
    (api.get as any).mockResolvedValue({ data: { data: LIVE_PLANS } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><PlansTeaser /></MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/plans"));
    expect(await screen.findByText("$120")).toBeInTheDocument();
    expect(screen.getByText("$16,000")).toBeInTheDocument();
    expect(screen.getByText(/Membresía mensual/)).toBeInTheDocument();
    expect(screen.getByText("$270")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
    expect(screen.getByText("$990")).toBeInTheDocument();
  });

  it("reflects a price change from the admin — the exact bug this fixes", async () => {
    (api.get as any).mockResolvedValue({
      data: { data: [{ name: "Clase individual", price: 315, currency: "MXN", classLimit: 1, durationDays: 30 }] },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><PlansTeaser /></MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("$315")).toBeInTheDocument();
  });
});
