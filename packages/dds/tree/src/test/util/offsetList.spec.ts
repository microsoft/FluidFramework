/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { OffsetListFactory } from "../../util/index.js";

describe("OffsetListFactory", () => {
	it("Inserts an offset when there is content after the offset", () => {
		const factory = new OffsetListFactory<string>();
		factory.pushOffset(42);
		factory.pushContent("foo");
		assert.deepStrictEqual(factory.list, [42, "foo"]);
	});

	it("Does not insert 0-length offsets", () => {
		const factory = new OffsetListFactory<string>();
		factory.pushOffset(0);
		factory.pushContent("foo");
		assert.deepStrictEqual(factory.list, ["foo"]);
	});

	it("Merges runs of offsets into a single offset", () => {
		const factory = new OffsetListFactory<string>();
		factory.pushOffset(42);
		factory.pushOffset(42);
		factory.pushContent("foo");
		assert.deepStrictEqual(factory.list, [84, "foo"]);
	});

	it("Does not insert an offset when there is no content after the offset", () => {
		const factory = new OffsetListFactory<string>();
		factory.pushContent("foo");
		factory.pushOffset(42);
		factory.pushOffset(42);
		assert.deepStrictEqual(factory.list, ["foo"]);
	});
});
