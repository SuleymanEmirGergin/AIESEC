import { describe, expect, it } from "vitest";
import { pathSuffix } from "./paths";

describe("pathSuffix", () => {
  it("normal parcalari kodlayarak ekler", () => {
    expect(pathSuffix([])).toBe("");
    expect(pathSuffix(["abc-1", "contacts"])).toBe("/abc-1/contacts");
    expect(pathSuffix(["İstanbul fatih"])).toBe("/%C4%B0stanbul%20fatih");
  });

  it("baska bir backend ucuna kacmayi reddeder", () => {
    expect(pathSuffix([".."])).toBeNull();
    expect(pathSuffix(["../../admin/stats"])).toBeNull();
    expect(pathSuffix(["..\\admin"])).toBeNull();
    expect(pathSuffix(["x", "."])).toBeNull();
    expect(pathSuffix(["x", ""])).toBeNull();
  });
});
