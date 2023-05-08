import { strict as assert } from "assert";
import { multiply } from "../multiply";

describe("Can use exported functions", () => {
	it("Can multiply", () => {
		assert.strictEqual(multiply(7, 5), 35);
	});
});
