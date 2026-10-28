/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import { JsonAsTree } from "../../../jsonDomainSchema.js";
import {
	conciseFromCursor,
	replaceConciseTreeHandles,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/conciseTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SchemaComponent } from "../../../simple-tree/treeSchema.js";
import { singleJsonCursor } from "../../json/index.js";

describe("simple-tree conciseTree", () => {
	it("conciseFromCursor", () => {
		assert.deepEqual(
			conciseFromCursor(
				singleJsonCursor({ a: { b: 1 } }),
				SchemaComponent.fromSchema(JsonAsTree.Tree).context,
				{},
			),
			{
				a: { b: 1 },
			},
		);
	});

	describe("replaceConciseTreeHandles", () => {
		it("no handles", () => {
			const tree = {
				a: { b: "x" },
			};
			const clone = replaceConciseTreeHandles(tree, () => {
				fail();
			});
			assert.notEqual(clone, tree);
			assert.deepEqual(clone, tree);
		});

		it("handles", () => {
			const tree = {
				a: { b: new MockHandle(1) },
			};
			const clone = replaceConciseTreeHandles(tree, () => "handle");
			assert.deepEqual(clone, {
				a: { b: "handle" },
			});
		});
	});
});
