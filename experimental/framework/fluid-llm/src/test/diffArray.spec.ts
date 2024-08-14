import { strict as assert } from "node:assert";

import { diffState } from "../diff.js";

describe("Array diff tests", () => {
	it("top level array & array diff", () => {
		assert.deepStrictEqual(diffState(["test", "testing"], ["test"]), [
			{
				type: "REMOVE",
				path: [1],
				oldValue: "testing",
			},
		]);
	});

	it("nested array", () => {
		assert.deepStrictEqual(
			diffState(["test", ["test"]], ["test", ["test", "test2"]]),
			[
				{
					type: "CREATE",
					path: [1, 1],
					value: "test2",
				},
			],
		);
	});

	it("object in array in object", () => {
		assert.deepStrictEqual(
			diffState(
				{ test: ["test", { test: true }] },
				{ test: ["test", { test: false }] },
			),
			[
				{
					type: "CHANGE",
					path: ["test", 1, "test"],
					value: false,
					oldValue: true,
				},
			],
		);
	});

	it("array to object", () => {
		assert.deepStrictEqual(diffState({ data: [] }, { data: { val: "test" } }), [
			{ type: "CHANGE", path: ["data"], value: { val: "test" }, oldValue: [] },
		]);
	});
});
