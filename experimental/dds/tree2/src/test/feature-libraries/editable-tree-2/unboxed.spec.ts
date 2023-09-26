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
	ValueSchema,
	rootFieldKey,
} from "../../../core";
import {
	AllowedTypes,
	FieldKind,
	FieldSchema,
	Optional,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
} from "../../../feature-libraries";
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import { unboxedField } from "../../../feature-libraries/editable-tree-2/unboxed";
import { forestWithContent } from "../../utils";
import { getReadonlyContext } from "./utils";

const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

function createSingleValueTree<Kind extends FieldKind, Types extends AllowedTypes>(
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
		describe("Optional", () => {
			function createPrimitiveTree(
				kind: ValueSchema,
				initialTree: any,
			): {
				schema: FieldSchema<Optional, [TreeSchema<"leaf">]>;
				context: Context;
				cursor: ITreeSubscriptionCursor;
			} {
				const builder = new SchemaBuilder("test");
				const leafSchema = builder.leaf("leaf", kind);
				const rootSchema = SchemaBuilder.fieldOptional(leafSchema);

				const { context, cursor } = createSingleValueTree(builder, rootSchema, initialTree);

				return {
					schema: rootSchema,
					context,
					cursor,
				};
			}

			it("No value", () => {
				const { schema, context, cursor } = createPrimitiveTree(
					ValueSchema.Number,
					undefined,
				);
				assert.equal(unboxedField(context, schema, cursor), undefined);
			});

			it("Number", () => {
				const { schema, context, cursor } = createPrimitiveTree(ValueSchema.Number, 42);
				assert.equal(unboxedField(context, schema, cursor), 42);
			});
		});

		// TODO cases:
		// * primitives
		// * struct
		// * union?
	});

	describe("unboxedTree", () => {});
	describe("unboxedUnion", () => {});
});
