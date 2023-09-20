/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import {
	AllowedTypes,
	Any,
	FieldKinds,
	FieldSchema,
	SchemaBuilder,
} from "../../../feature-libraries";
import {
	FieldKey,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	ValueSchema,
} from "../../../core";
import { forestWithContent } from "../../utils";
import { brand } from "../../../util";
import {
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/editable-tree-2/lazyField";
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import { getReadonlyContext } from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor = { parent: undefined, fieldKey: detachedField };

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder("lazyTree");
		builder.struct("empty", {});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = context.forest.allocateCursor();
		assert.equal(
			forest.tryMoveCursorToField({ fieldKey: detachedField, parent: undefined }, cursor),
			TreeNavigationResult.Ok,
		);
		const sequenceField = new LazySequence(
			context,
			SchemaBuilder.fieldSequence(Any),
			cursor,
			detachedFieldAnchor,
		);
		const optionalField = new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(Any),
			cursor,
			detachedFieldAnchor,
		);
		const valueField = new LazyValueField(
			context,
			SchemaBuilder.fieldValue(Any),
			cursor,
			detachedFieldAnchor,
		);
		cursor.free();
		assert.throws(
			() => sequenceField.replaceRange(0, 1, []),
			/only allowed on fields with TreeStatus.InDocument status/,
		);
		assert.throws(
			() => optionalField.setContent(undefined),
			/only allowed on fields with TreeStatus.InDocument status/,
		);
		assert.throws(
			() => valueField.setContent({}),
			/only allowed on fields with TreeStatus.InDocument status/,
		);
	});
});

describe("LazyOptionalField", () => {
	describe("as", () => {
		function initializeForest(): {
			builder: SchemaBuilder;
			context: Context;
			cursor: ITreeSubscriptionCursor;
		} {
			const builder = new SchemaBuilder("lazyField");
			builder.struct("empty", {});
			const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
			const forest = forestWithContent({ schema, initialTree: {} });
			const context = getReadonlyContext(forest, schema);
			const cursor = context.forest.allocateCursor();
			return { builder, context, cursor };
		}

		function createLazyOptionalField<TTypes extends AllowedTypes>(
			fieldSchema: FieldSchema<typeof FieldKinds.optional, TTypes>,
			context: Context,
			cursor: ITreeSubscriptionCursor,
		): LazyOptionalField<TTypes> {
			assert.equal(
				context.forest.tryMoveCursorToField(
					{ fieldKey: detachedField, parent: undefined },
					cursor,
				),
				TreeNavigationResult.Ok,
			);

			return new LazyOptionalField(context, fieldSchema, cursor, detachedFieldAnchor);
		}

		it("Any", () => {
			const { builder, context, cursor } = initializeForest();
			const field = createLazyOptionalField(
				SchemaBuilder.fieldOptional(Any),
				context,
				cursor,
			);

			// Arbitrary leaf schema to test some cases with
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);

			// Positive cases
			assert(field.is(SchemaBuilder.fieldOptional(Any)));
			assert(field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, Any)));

			// Negative cases
			assert(!field.is(SchemaBuilder.fieldOptional()));
			assert(!field.is(SchemaBuilder.fieldOptional(booleanLeafSchema)));
			assert(!field.is(SchemaBuilder.fieldValue(Any)));
			assert(!field.is(SchemaBuilder.fieldSequence(Any)));
			assert(!field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, booleanLeafSchema)));
		});

		it("Boolean", () => {
			const { builder, context, cursor } = initializeForest();
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
			const field = createLazyOptionalField(
				SchemaBuilder.fieldOptional(booleanLeafSchema),
				context,
				cursor,
			);

			// Arbitrary leaf schema to test some cases with
			const numberLeafSchema = builder.leaf("number", ValueSchema.Number);

			// Positive cases
			// assert(field.is(SchemaBuilder.fieldOptional(Any)));
			assert(field.is(SchemaBuilder.fieldOptional(booleanLeafSchema)));
			// assert(field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, Any)));
			assert(field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, booleanLeafSchema)));

			// Negative cases
			// assert(!field.is(SchemaBuilder.fieldOptional()));
			// assert.equal(field.is(SchemaBuilder.fieldOptional(numberLeafSchema)), false);
			assert.equal(field.is(SchemaBuilder.fieldValue(Any)), false);
			assert.equal(field.is(SchemaBuilder.fieldValue(booleanLeafSchema)), false);
			assert.equal(field.is(SchemaBuilder.fieldValue(numberLeafSchema)), false);
			assert.equal(field.is(SchemaBuilder.fieldSequence(Any)), false);
			assert.equal(field.is(SchemaBuilder.fieldSequence(booleanLeafSchema)), false);
			assert.equal(field.is(SchemaBuilder.fieldSequence(numberLeafSchema)), false);
			// assert.equal(
			// 	field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, numberLeafSchema)),
			// 	false,
			// );
		});
	});
});
