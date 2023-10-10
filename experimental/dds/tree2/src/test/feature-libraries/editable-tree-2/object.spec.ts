/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../../feature-libraries";
import { leaf } from "../../../domains";

import { createTreeView } from "./utils";

const builder = new SchemaBuilder({ scope: "test", libraries: [leaf.library] });

export const stringList = builder.fieldNode(
	"List<string>",
	SchemaBuilder.fieldSequence(leaf.string),
);

export const numberList = builder.fieldNode(
	"List<number>",
	SchemaBuilder.fieldSequence(leaf.number),
);

// TODO: Using separate arrays for 'numbers' and 'strings' is a workaround for
//       UnboxNodeUnion not unboxing unions.
const root = builder.struct("root", {
	strings: SchemaBuilder.fieldRequired(stringList),
	numbers: SchemaBuilder.fieldRequired(numberList),
});

const schema = builder.toDocumentSchema(SchemaBuilder.fieldRequired(root));

describe("Object", () => {
	function createTree() {
		// Consider 'initializeTreeWithContent' for readonly tests?
		return createTreeView(schema, { numbers: [0], strings: ["a"] });
	}

	it("works", () => {
		const tree = createTree();
		const obj = tree.root2(schema);
		const list = obj.strings;
		assert.deepEqual(list, list);
		assert.deepEqual(list, ["a"]);
		assert.deepEqual(obj, {
			numbers: [0],
			strings: ["a"],
		});
	});
});
