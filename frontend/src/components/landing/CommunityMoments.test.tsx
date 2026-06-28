import { render, screen } from "@testing-library/react";
import { CommunityMoments } from "./CommunityMoments";

describe("CommunityMoments", () => {
  it("renders an inauguration photo mosaic", () => {
    render(<CommunityMoments />);

    expect(screen.getByText("Comunidad VARRE24")).toBeInTheDocument();
    const images = screen.getAllByRole("img", { name: /VARRE24/i });

    expect(images).toHaveLength(4);
    images.forEach((image) => {
      expect(image).toHaveAttribute("loading", "eager");
    });
  });
});
