import { describe, expect, it } from "vitest";
import { formatStudioDate } from "./utils";

describe("formatStudioDate", () => {
  const longDate = { day: "2-digit", month: "long", year: "numeric" } as const;

  it("conserva el día de una fecha civil YYYY-MM-DD", () => {
    expect(formatStudioDate("2026-08-30", longDate)).toBe("30 de agosto de 2026");
  });

  it("no resta un día cuando PostgreSQL serializa DATE a medianoche UTC", () => {
    expect(formatStudioDate("2026-08-30T00:00:00.000Z", longDate)).toBe("30 de agosto de 2026");
  });

  it("conserva fechas de fin de mes", () => {
    expect(formatStudioDate("2026-03-01T00:00:00.000Z", longDate)).toBe("01 de marzo de 2026");
  });
});
