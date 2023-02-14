import { add } from "fluid_internal_wasm";
import { strict as assert } from "assert";

describe("WASM", () => {
  it("can add two numbers", () => {
    assert.strictEqual(add(1, 2), 3);
  })
});