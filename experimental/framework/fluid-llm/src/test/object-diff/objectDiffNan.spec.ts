import { strict as assert } from "node:assert";

import { objectDiff } from "../../object-diff/index.js";

describe("objectDiff - NaN", () => {
	it("new NaN value in object", () => {
		assert.deepStrictEqual(objectDiff({}, { testNaN: Number.NaN }), [
			{
				type: "CREATE",
				path: ["testNaN"],
				value: Number.NaN,
			},
		]);
	});
	it("change NaN value in object", () => {
		assert.deepStrictEqual(objectDiff({ testNaN: Number.NaN }, { testNaN: 0 }), [
			{
				type: "CHANGE",
				path: ["testNaN"],
				value: 0,
				oldValue: Number.NaN,
			},
		]);
	});
	it("do not change NaN value in object", () => {
		assert.deepStrictEqual(objectDiff({ testNaN: Number.NaN }, { testNaN: Number.NaN }), []);
	});
	it("remove NaN value in object", () => {
		assert.deepStrictEqual(objectDiff({ testNaN: Number.NaN }, {}), [
			{
				type: "REMOVE",
				path: ["testNaN"],
				oldValue: Number.NaN,
			},
		]);
	});
	it("new NaN value in array", () => {
		assert.deepStrictEqual(objectDiff([], [Number.NaN]), [
			{
				type: "CREATE",
				path: [0],
				value: Number.NaN,
			},
		]);
	});
	it("change NaN value in object", () => {
		assert.deepStrictEqual(objectDiff([Number.NaN], [0]), [
			{
				type: "CHANGE",
				path: [0],
				value: 0,
				oldValue: Number.NaN,
			},
		]);
	});
	it("do not change NaN value in array", () => {
		assert.deepStrictEqual(objectDiff([Number.NaN], [Number.NaN]), []);
	});
});
