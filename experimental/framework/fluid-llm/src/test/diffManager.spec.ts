import { strict as assert } from "node:assert";

import { DiffManager, traversePath } from "../diffManager.js";



describe("DiffManager - CREATE - compareAndApplyDiffs", () => {

	it("Simple object attribute create", () => {
		const originalObject: Record<string, unknown> = {};
		const newObject: Record<string, unknown> = {test: true};

		const diffManager = new DiffManager();
		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject.test === true);
	});

	it("Simple object attribute create within array", () => {
		const originalObject: Record<string, unknown>[] = [{}];
		const newObject: Record<string, unknown>[] = [{test: true}];

		const diffManager = new DiffManager();
		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject[0]?.test === true);
	});

	it("add new object attribute to existing object within array", () => {
			const originalObject: Record<string, unknown>[] = [{}];
			const newObject: Record<string, unknown>[] = [{test: {value: true}}];

			const diffManager = new DiffManager();

			diffManager.compareAndApplyDiffs(originalObject, newObject);
			assert((originalObject[0]?.test as Record<string, unknown>)?.value === true);
	});

	it("Add multiple new objects to array", () => {
		const originalObject: Record<string, unknown>[] = [{}];

		const newObject: Record<string, unknown>[] = [{test: true}, {test: true}, {test: true}];

		const diffManager = new DiffManager();

		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject.length === 3);
		assert(originalObject[0]?.test === true);
		assert(originalObject[1]?.test === true);
		assert(originalObject[2]?.test === true);
	});

});

describe("DiffManager - CHANGE - compareAndApplyDiffs", () => {

	it("Simple object attribute change", () => {
		const originalObject = {test: true};
		const newObject = {test: false};

		const diffManager = new DiffManager();
		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject.test === false);
	});

	it("Simple object attribute change within array", () => {
		const originalObject = [{test: true}];
		const newObject = [{test: false}];

		const diffManager = new DiffManager();
		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject[0]?.test === false);
	});

	it("Nested object attribute change within outer array", () => {
		const originalObject = [{
			test: {
				value: true
			}
		}];
		const newObject = [{
			test: {
				value: false
			}
		}];

		const diffManager = new DiffManager();
		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject[0]?.test.value === false);
	});


	it("Nested object attribute change within inner array", () => {
		const originalObject = {
			test: {
				value: [{}, {innerValue: true}]
			}
		};
		const newObject = {
			test: {
				value: [{}, {innerValue: false}]
			}
		};

		const diffManager = new DiffManager();
		diffManager.compareAndApplyDiffs(originalObject, newObject);
		assert(originalObject.test.value[1]?.innerValue === false);
	});
});

describe("DiffManager - CREATE - compareAndApplyDiffs", () => {

});

describe("DiffManager - traversePath", () => {

	it("Simple attribute target", () => {
		const targetObject = {test: true}
		const jsonObject = {
			object: targetObject
		};

		const path = ["object"];
		const actual: unknown = traversePath(jsonObject, path);
		assert.strictEqual(actual, targetObject);
	});

	it("Simple nested object target", () => {
		const jsonObject = {
			object: {
				test: true,
			},
		};

		const path = ["object", "test"];
		const actual: unknown = traversePath(jsonObject, path);
		assert.strictEqual(actual, true);
	});

	it("Array nested within object target", () => {
		const targetObject = { hello: "world" };
		const jsonObject = {
			object: {
				test: [
					{
						valueOne: 1
					},
					{
						valueTwo: targetObject
					}
				]
			},
		};

		const path = ["object", "test", 1, "valueTwo"];
		const actual: unknown = traversePath(jsonObject, path);
		assert.strictEqual(actual, targetObject);
	});

	it("Object nested within array target", () => {
		const targetObject = { hello: "world" };
		const jsonObject = [
			{
				object: {
					test: [
						{
						valueOne: 1
						},
					]
			},
		},
		{
			object: {
				test: [
					{
						valueTwo: targetObject
					}
				]
			},
		}
	];

		const path = [1, "object", "test", 0, "valueTwo"];
		const actual: unknown = traversePath(jsonObject, path);
		assert.strictEqual(actual, targetObject);
	});

	it("Root array object target", () => {
		const targetObject = {
			object: {
				test: [
					{
						valueTwo:  {
							hello: "world"
						}
					}
				]
			},
		}
		const jsonObject = [
			{
				object: {
					test: [
						{
							valueOne: 1
						},
					]
				},
			},
			targetObject
		];

		const path = [1];
		const actual: unknown = traversePath(jsonObject, path);
		assert.strictEqual(actual, targetObject);
	});


});
