/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import {
	FieldAnchor,
	IEditableForest,
	ITreeCursorSynchronous,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core";
import { AllowedTypes, FieldSchema, SchemaAware, SchemaBuilder } from "../../../feature-libraries";
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import { forestWithContent } from "../../utils";
import { getReadonlyContext } from "./utils";

const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

function createSingleValueTree<Kind extends FieldKindTypes, Types extends AllowedTypes>(
	builder: SchemaBuilder,
	rootSchema: FieldSchema<Kind, Types>,
	initialTree?:
		| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
	forest: IEditableForest;
} {
	const schema = builder.intoDocumentSchema(rootSchema);
	const forest = forestWithContent({ schema, initialTree });

	const context = getReadonlyContext(forest, schema);
	const cursor = context.forest.allocateCursor();

	assert.equal(
		context.forest.tryMoveCursorToField(rootFieldAnchor, cursor),
		TreeNavigationResult.Ok,
	);

	return {
		forest,
		context,
		cursor,
	};
}

describe.only("unboxed unit tests", () => {
	describe("unboxedField", () => {
		it("Optional field with no value", () => {
			console.log("TODO");
		});

		// TODO cases:
		// * primitives
		// * struct
		// * union?
	});

	describe("unboxedTree", () => {});
	describe("unboxedUnion", () => {});
});
