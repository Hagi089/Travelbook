import { describe, it, expect } from "vitest";
import { isNativeAndroid } from "../src/platform";

describe("isNativeAndroid", () => {
  it("ist im Browser/Node false", () => {
    expect(isNativeAndroid()).toBe(false);
  });
});
