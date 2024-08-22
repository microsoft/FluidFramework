import { strict as assert } from "node:assert";

import { objectDiff, type Difference } from "../../object-diff/index.js";

describe("objectDiff - arrays", () => {
	it("top level array & array diff", () => {
		assert.deepStrictEqual(objectDiff(["test", "testing"], ["test"]), [
			{
				type: "REMOVE",
				path: [1],
				oldValue: "testing",
			},
		]);
	});

	it("nested array", () => {
		assert.deepStrictEqual(
			objectDiff(["test", ["test"]], ["test", ["test", "test2"]]),
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
			objectDiff(
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
		assert.deepStrictEqual(
			objectDiff({ data: [] }, { data: { val: "test" } }), [
			{ type: "CHANGE", path: ["data"], value: { val: "test" }, oldValue: [] },
		]);
	});


});


describe("objectDiff - arrays with object ID's", () => {
	it("object with id is moved from a new deleted array index", () => {
		const diffs: Difference[] = objectDiff(
			{ state: ["test", { id: '1', test: true }] },
			{ state: [{ id: '1', test: true }] },
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: 'id'
				}
			}
		);

		assert.deepStrictEqual(diffs,
			[
				{
					type: "CHANGE",
					path: ["state", 0,],
					value: { id: '1', test: true },
					oldValue: 'test',
				},
				{
					type: "MOVE",
					path: ["state", 1],
					newIndex: 0,
					value: { id: '1', test: true }
				}
			]
		);
	});

	it("objects with id swap array indexes", () => {
		const diffs: Difference[] = objectDiff(
			{ state: [{ id: '1', test: true }, { id: '2', test: true }] },
			{ state: [{ id: '2', test: true }, { id: '1', test: true }] },
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: 'id'
				}
			}
		);

		assert.deepStrictEqual(diffs,
			[
				{
					type: "MOVE",
					path: ["state", 0],
					value: { id: '1', test: true },
					newIndex: 1,
				},
				{
					type: "MOVE",
					path: ["state", 1],
					value: { id: '2', test: true },
					newIndex: 0,
				}
			]
		);
	});

	it("Preexisting objects with id is swapped to an array index with a new object", () => {
		const diffs: Difference[] = objectDiff(
			{ state: [{ id: '1', test: true }, { id: '2', test: true }] },
			{ state: [{ id: '3', test: true }, { id: '1', test: true }] },
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: 'id'
				}
			}
		);

		assert.deepStrictEqual(diffs,
			[
				{
					type: "MOVE",
					path: ["state", 0],
					value: { id: '1', test: true },
					newIndex: 1,
				},
				{
					type: "REMOVE",
					path: ["state", 1],
					oldValue: { id: '2', test: true },
				},
				{
					type: "CREATE",
					path: ["state", 0],
					value: { id: '3', test: true },
				}
			]
		);
	});


	it("Preexisting objects with id is changed and swapped to an array index with a new object", () => {
		const diffs: Difference[] = objectDiff(
			{ state: [{ id: '1', test: true }, { id: '2', test: true }] },
			{ state: [{ id: '3', test: true }, { id: '1', test: false }] },
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: 'id'
				}
			}
		);

		assert.deepStrictEqual(diffs,
			[
				{
					type: "MOVE",
					path: ["state", 0],
					value: { id: '1', test: true },
					newIndex: 1,
				},
				{
					type: "CHANGE",
					path: ["state", 0, "test"],
					oldValue: true,
					value: false
				},
				{
					type: "REMOVE",
					path: ["state", 1],
					oldValue: { id: '2', test: true },
				},
				{
					type: "CREATE",
					path: ["state", 0],
					value: { id: '3', test: true },
				}
			]
		);
	});

	it("objects with id swap array indexes", () => {
		const diffs: Difference[] = objectDiff(
			{ state: [{ id: '1', test: true }, { id: '2', test: true }] },
			{ state: [{ id: '2', test: false }, { id: '1', test: true }] },
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: 'id'
				}
			}
		);

		assert.deepStrictEqual(diffs,
			[
				{
					type: "MOVE",
					path: ["state", 0],
					value: { id: '1', test: true },
					newIndex: 1,
				},
				{
					type: "MOVE",
					path: ["state", 1],
					value: { id: '2', test: true },
					newIndex: 0,
				},
				{
					type: "CHANGE",
					path: ["state", 1, "test"],
					oldValue: true,
					value: false
				}
			]
		);
	});
});
