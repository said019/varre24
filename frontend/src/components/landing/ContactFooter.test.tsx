import { render, screen } from "@testing-library/react";
import { ContactFooter } from "./ContactFooter";

describe("ContactFooter", () => {
  it("shows address, IG handle and a WhatsApp CTA", () => {
    render(<ContactFooter />);
    expect(screen.getByText(/Nápoles/)).toBeInTheDocument();
    expect(screen.getByText("@varre.studio")).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
  });
});
