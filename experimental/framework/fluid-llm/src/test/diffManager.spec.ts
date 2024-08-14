import { strict as assert } from "node:assert";

import { traversePath } from "../diffManager.js";

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
