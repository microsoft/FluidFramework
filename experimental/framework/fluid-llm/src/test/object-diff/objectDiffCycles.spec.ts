import { strict as assert } from "node:assert";

import { objectDiff } from "../../object-diff/index.js";

describe("objectDiff - cycles", () => {
	it("Handles recursive references", () => {
		const obj1: Record<string, unknown> = {};
		obj1.a = obj1;
		assert.deepStrictEqual(objectDiff(obj1, obj1), []);
	});

	it("Handles recursive references more than 1 level up", () => {
		const obj1 = { a: { b: {} }  };
		obj1.a.b = obj1;
		assert.deepStrictEqual(objectDiff(obj1, obj1), []);
	});

});
