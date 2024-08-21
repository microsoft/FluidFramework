import { strict as assert } from "node:assert";

import { objectDiff, type Difference } from "../../objectDiff.js";

describe("objectDiff - arrays", () => {
	it("top level array & array diff", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			objectDiff({ data: [] }, { data: { val: "test" } }), [
			{ type: "CHANGE", path: ["data"], value: { val: "test" }, oldValue: [] },
		]);
	});


});


describe("objectDiff - arrays with object ID's", () => {
	it("object with id is moved from a new deleted array index", () => {
		const diffs: Difference[] = objectDiff(
			{ test: ["test", { id: '1', test: true }] },
			{ test: [{ id: '1', test: true }] },
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
					path: ["test", 0,],
					value: { id: '1', test: true },
					oldValue: 'test',
				},
				{
					type: "MOVE",
					path: ["test", 1],
					newIndex: 0,
					value: { id: '1', test: true }
				}
			]
		);
	});

	it("objects with id swap array indexes", () => {
		const diffs: Difference[] = objectDiff(
			{ test: [{ id: '1', test: true }, { id: '2', test: true }] },
			{ test: [{ id: '2', test: true }, { id: '1', test: true }] },
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
					path: ["test", 0],
					value: { id: '1', test: true },
					newIndex: 1,
				},
				{
					type: "MOVE",
					path: ["test", 1],
					value: { id: '2', test: true },
					newIndex: 0,
				}
			]
		);
	});

	it("Preexisting objects with id is swapped to an array indexes with a new object", () => {
		const diffs: Difference[] = objectDiff(
			{ test: [{ id: '1', test: true }, { id: '2', test: true }] },
			{ test: [{ id: '3', test: true }, { id: '1', test: true }] },
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
					path: ["test", 0],
					value: { id: '1', test: true },
					newIndex: 1,
				},
				{
					type: "REMOVE",
					path: ["test", 1],
					oldValue: { id: '2', test: true },
				},
				{
					type: "CREATE",
					path: ["test", 0],
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

		debugger;

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
