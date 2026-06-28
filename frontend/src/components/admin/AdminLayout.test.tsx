import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import AdminLayout from "./AdminLayout";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("./AdminPendingBell", () => ({
  AdminPendingBell: () => <button type="button" aria-label="Sin ordenes pendientes" />,
}));

describe("AdminLayout", () => {
  it("keeps admin content and adds a studio image accent in the sidebar", () => {
    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <AdminLayout>
          <section>Panel admin</section>
        </AdminLayout>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("admin-photo-accent")).toBeInTheDocument();
    expect(screen.getByText("Panel admin")).toBeInTheDocument();
  });
});
