import { describe, expect, it } from "vitest";

import { isDateParam, readSearchParam, withSearchParam } from "@/hooks/use-search-param-state";

const STATUSES = ["ALL", "CONFIRMED", "CANCELLED"] as const;

describe("filters in the query string", () => {
  it("reads a value the page accepts, and falls back to the default otherwise", () => {
    const read = (query: string) => readSearchParam(new URLSearchParams(query), "status", "ALL", STATUSES);

    expect(read("status=CANCELLED")).toBe("CANCELLED");
    expect(read("")).toBe("ALL");
    // A hand-edited or out-of-date link never reaches the API.
    expect(read("status=DELETED")).toBe("ALL");
    expect(read("status=cancelled")).toBe("ALL");
  });

  it("checks free-form values such as dates", () => {
    const read = (query: string) => readSearchParam(new URLSearchParams(query), "date", "2030-01-01", isDateParam);

    expect(read("date=2030-02-28")).toBe("2030-02-28");
    expect(read("date=2030-13-45")).toBe("2030-01-01");
    expect(read("date=tomorrow")).toBe("2030-01-01");
  });

  it("sets and clears one parameter, keeping the rest of the URL", () => {
    const page = "http://localhost:3000/business/bookings?date=2030-01-02#list";

    expect(withSearchParam(page, "status", "CONFIRMED")).toBe(
      "http://localhost:3000/business/bookings?date=2030-01-02&status=CONFIRMED#list",
    );
    expect(withSearchParam(page, "date", null)).toBe("http://localhost:3000/business/bookings#list");
    expect(withSearchParam("http://localhost:3000/business/customers", "q", "ayesha khan")).toBe(
      "http://localhost:3000/business/customers?q=ayesha+khan",
    );
    expect(withSearchParam("http://localhost:3000/business/customers?q=ali", "q", "")).toBe(
      "http://localhost:3000/business/customers",
    );
  });
});
