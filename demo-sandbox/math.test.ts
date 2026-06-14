import { expect, test } from "bun:test";
import { add } from "./math";

test("add 2 + 3", () => {
  expect(add(2, 3)).toBe(5);
});
