/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import { Any, FieldKinds, SchemaBuilder } from "../../../feature-libraries";
import {
	FieldAnchor,
	FieldKey,
	IEditableForest,
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
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };

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

describe.only("LazyOptionalField", () => {
	function initializeForest(builder: SchemaBuilder): {
		context: Context;
		cursor: ITreeSubscriptionCursor;
		forest: IEditableForest;
	} {
		const rootNodeSchema = builder.struct("root", { root: SchemaBuilder.fieldOptional(Any) });
		const schema = builder.intoDocumentSchema(
			SchemaBuilder.field(FieldKinds.optional, rootNodeSchema),
		);
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = context.forest.allocateCursor();

		assert.equal(
			context.forest.tryMoveCursorToField(
				{ fieldKey: detachedField, parent: undefined },
				cursor,
			),
			TreeNavigationResult.Ok,
		);

		return { context, cursor, forest };
	}

	describe("as", () => {
		it("Any", () => {
			const builder = new SchemaBuilder("test");
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
			const { context, cursor } = initializeForest(builder);

			const field = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(Any),
				cursor,
				detachedFieldAnchor,
			);

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
			const builder = new SchemaBuilder("test");
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
			const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
			const { context, cursor } = initializeForest(builder);

			const field = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(booleanLeafSchema),
				cursor,
				detachedFieldAnchor,
			);

			// Positive cases
			assert(field.is(SchemaBuilder.fieldOptional(booleanLeafSchema)));
			assert(field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, booleanLeafSchema)));

			// Negative cases
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

	describe("length", () => {
		it("No value", () => {
			const builder = new SchemaBuilder("test");
			const { context, cursor } = initializeForest(builder);

			const field = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(Any),
				cursor,
				detachedFieldAnchor,
			);

			assert.equal(field.length, 0);
		});

		it("With value", () => {
			const builder = new SchemaBuilder("test");
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
			const { context, cursor, forest } = initializeForest(builder);

			const field = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(booleanLeafSchema),
				cursor,
				cursor.buildFieldAnchor(), // TODO
			);

			cursor.enterField(field.key);
			field.setContent(true);

			assert.equal(field.length, 1);
		});
	});
});
