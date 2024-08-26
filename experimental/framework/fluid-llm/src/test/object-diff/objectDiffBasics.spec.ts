import { strict as assert } from "node:assert";

import { objectDiff, type Difference } from "../../object-diff/index.js";

describe("objectDiff - basics", () => {
	it("new raw value", () => {
		const actualDifference = objectDiff({ test: true }, { test: true, test2: true });
		const expectedDifference: Difference = {
			type: "CREATE",
			path: ["test2"],
			value: true,
		};
		assert.deepStrictEqual(actualDifference, [expectedDifference]);
	});

	it("change raw value", () => {
		assert.deepStrictEqual(objectDiff({ test: true }, { test: false }), [
			{
				type: "CHANGE",
				path: ["test"],
				value: false,
				oldValue: true,
			},
		]);
	});
	it("remove raw value", () => {
		assert.deepStrictEqual(objectDiff({ test: true, test2: true }, { test: true }), [
			{
				type: "REMOVE",
				path: ["test2"],
				oldValue: true,
			},
		]);
	});

	it("replace object with null", () => {
		assert.deepStrictEqual(objectDiff({ object: { test: true } }, { object: null }), [
			{
				type: "CHANGE",
				path: ["object"],
				value: null,
				oldValue: { test: true },
			},
		]);
	});

	it("replace object with other value", () => {
		assert.deepStrictEqual(objectDiff({ object: { test: true } }, { object: "string" }), [
			{
				type: "CHANGE",
				path: ["object"],
				value: "string",
				oldValue: { test: true },
			},
		]);
	});

	it("equal null protype objects", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		assert.deepStrictEqual(objectDiff(Object.create(null), Object.create(null)), []);
	});

	it("unequal null protype objects", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const obj1 = Object.create(null);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const obj2 = Object.create(null);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		obj2.test = true;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		assert.deepStrictEqual(objectDiff(obj1, obj2), [
			{
				type: "CREATE",
				path: ["test"],
				value: true,
			},
		]);
	});
});
