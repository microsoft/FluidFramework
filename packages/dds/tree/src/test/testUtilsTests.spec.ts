/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { JsonableTree } from "../core/index.js";
import { brand } from "../util/index.js";

import { prepareTreeForCompare } from "./utils.js";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

describe("Test utils", () => {
	describe("prepareTreeForCompare", () => {
		it("normalizing", () => {
			assert.deepEqual(prepareTreeForCompare([{ type: brand("foo") }]), [{ type: "foo" }]);
			assert.deepEqual(prepareTreeForCompare([{ type: brand("foo"), fields: {} }]), [
				{ type: "foo" },
			]);
			assert.deepEqual(prepareTreeForCompare([{ type: brand("foo"), value: undefined }]), [
				{ type: "foo" },
			]);
		});

		it("without handles", () => {
			assert.deepEqual(prepareTreeForCompare([]), []);
			const leaf: JsonableTree = {
				type: brand("baz"),
				value: "x",
			};
			const cases: JsonableTree[] = [
				{ type: brand("foo") },
				leaf,
				{ type: brand("foo"), fields: { f: [leaf] } },
			];
			for (const node of cases) {
				assert.deepEqual(prepareTreeForCompare([node]), [node]);
			}
			// make sure multiple nodes work at once.
			assert.deepEqual(prepareTreeForCompare(cases), cases);
		});

		it("with handles", () => {
			assert.deepEqual(prepareTreeForCompare([]), []);
			const withHandle: JsonableTree = {
				type: brand("baz"),
				value: new MockHandle(5, "path", "fullPath"),
			};
			const withHandleExpected = {
				type: "baz",
				value: { Handle: "fullPath" },
			};
			const cases: JsonableTree[] = [
				{ type: brand("foo") },
				withHandle,
				{ type: brand("foo"), fields: { f: [withHandle] } },
			];
			assert.deepEqual(prepareTreeForCompare(cases), [
				{ type: "foo" },
				withHandleExpected,
				{ type: "foo", fields: { f: [withHandleExpected] } },
			]);
		});
	});
});
