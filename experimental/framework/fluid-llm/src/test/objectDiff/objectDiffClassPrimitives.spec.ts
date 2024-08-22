import { strict as assert } from "node:assert";

import { objectDiff } from "../../object-diff/index.js";

describe("objectDiff - Class Primitives", () => {

	it("Handles equal string classes", () => {
		assert.deepStrictEqual(
			objectDiff({ string: String("hi") }, { string: String("hi") }),
			[]
		);
	});

	it("Handles equal number classes", () => {
		assert.deepStrictEqual(
			objectDiff({ number: Number(1) }, { number: Number(1) }),
			[]
		);
	});

	it("Handles unequal number classes", () => {
		assert.deepStrictEqual(
			objectDiff({ number: Number(1) }, { number: Number(2) }),
			[
				{
					type: "CHANGE",
					path: ["number"],
					value: Number(2),
					oldValue: Number(1),
				},
			]
		);
	});

});
