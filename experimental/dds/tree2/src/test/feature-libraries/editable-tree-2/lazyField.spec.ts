/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";

import { TreeContent } from "../../../shared-tree";
import {
	type AllowedTypes,
	Any,
	type FieldKind,
	FieldKinds,
	SchemaBuilder,
} from "../../../feature-libraries";
import {
	FieldAnchor,
	FieldKey,
	type ITreeSubscriptionCursor,
	rootFieldKey,
	TreeNavigationResult,
	UpPath,
} from "../../../core";
import { forestWithContent } from "../../utils";
import { leaf as leafDomain } from "../../../domains";
import { brand } from "../../../util";
import { type Context } from "../../../feature-libraries/editable-tree-2/context";
import {
	LazyField,
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/editable-tree-2/lazyField";
import { contextWithContentReadonly, getReadonlyContext } from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };
const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.forest.allocateCursor();

	assert.equal(context.forest.tryMoveCursorToField(anchor, cursor), TreeNavigationResult.Ok);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FieldKind, Types extends AllowedTypes>(
	treeContent: TreeContent,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly(treeContent);
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

/**
 * Test {@link LazyField} implementation.
 */
class TestLazyField<TTypes extends AllowedTypes> extends LazyField<
	typeof FieldKinds.optional,
	TTypes
> {}

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder({ scope: "lazyTree" });
		builder.struct("empty", {});
		const schema = builder.toDocumentSchema(SchemaBuilder.fieldOptional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = initializeCursor(context, detachedFieldAnchor);

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
			SchemaBuilder.fieldRequired(Any),
			cursor,
			detachedFieldAnchor,
		);
		cursor.free();
		assert.throws(
			() => sequenceField.insertAt(0, [1]),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
		assert.throws(
			() => (optionalField.content = undefined),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
		assert.throws(
			() => (valueField.content = {}),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
	});

	it("is", () => {
		// #region Tree and schema initialization

		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const rootSchema = SchemaBuilder.fieldOptional(builder.struct("struct", {}));
		const schema = builder.toDocumentSchema(rootSchema);

		// Note: this tree initialization is strictly to enable construction of the lazy field.
		// The test cases below are strictly in terms of the schema of the created fields.
		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });

		// #endregion

		// #region OptionalField<Any>

		const anyOptionalField = new TestLazyField(
			context,
			SchemaBuilder.fieldOptional(Any),
			cursor,
			detachedFieldAnchor,
		);

		assert(anyOptionalField.is(SchemaBuilder.fieldOptional(Any)));

		assert(!anyOptionalField.is(SchemaBuilder.fieldOptional()));
		assert(!anyOptionalField.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
		assert(!anyOptionalField.is(SchemaBuilder.fieldRequired()));
		assert(!anyOptionalField.is(SchemaBuilder.fieldRequired(Any)));
		assert(!anyOptionalField.is(SchemaBuilder.fieldRequired(leafDomain.boolean)));
		assert(!anyOptionalField.is(SchemaBuilder.fieldSequence()));
		assert(!anyOptionalField.is(SchemaBuilder.fieldSequence(Any)));
		assert(!anyOptionalField.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));

		// #endregion

		// #region OptionalField<Primitive>

		const booleanOptionalField = new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(leafDomain.boolean),
			cursor,
			detachedFieldAnchor,
		);

		assert(booleanOptionalField.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));

		assert(!booleanOptionalField.is(SchemaBuilder.fieldOptional(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldOptional(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldRequired()));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldRequired(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldRequired(leafDomain.boolean)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldRequired(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldSequence()));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldSequence(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldSequence(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.fieldOptional()));

		// #endregion
	});

	it("parent", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const struct = builder.struct("struct", {
			foo: SchemaBuilder.fieldOptional(...leafDomain.primitives),
		});
		const rootSchema = SchemaBuilder.fieldOptional(struct);
		const schema = builder.toDocumentSchema(rootSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: {
				foo: "Hello world",
			},
		});

		const rootField = new TestLazyField(context, rootSchema, cursor, rootFieldAnchor);
		assert.equal(rootField.parent, undefined);

		const parentPath: UpPath = {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
		};
		const parentAnchor = context.forest.anchors.track(parentPath);

		// Move cursor down to leaf field
		cursor.enterNode(0);
		cursor.enterField(brand("foo"));

		const leafField = new TestLazyField(
			context,
			SchemaBuilder.fieldOptional(...leafDomain.primitives),
			cursor,
			{
				parent: parentAnchor,
				fieldKey: brand("foo"),
			},
		);
		assert.equal(leafField.parent, rootField.boxedAt(0));
	});
});

describe("LazyOptionalField", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = SchemaBuilder.fieldOptional(leafDomain.number);
	const schema = builder.toDocumentSchema(rootSchema);

	describe("Field with value", () => {
		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });
		const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

		it("at", () => {
			assert.equal(field.at(0), 42);
		});

		it("boxedAt", () => {
			const boxedResult = field.boxedAt(0);
			assert.equal(boxedResult.type, leafDomain.number.name);
			assert.equal(boxedResult.value, 42);
		});

		it("length", () => {
			assert.equal(field.length, 1);
		});

		it("map", () => {
			assert.deepEqual(
				field.map((value) => value),
				[42],
			);
		});

		it("mapBoxed", () => {
			const mapResult = field.mapBoxed((value) => value);
			assert.equal(mapResult.length, 1);
			assert.equal(mapResult[0].value, 42);
		});
	});

	describe("Field without value", () => {
		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: undefined,
		});
		const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

		it("at", () => {
			// Invalid to request the value if there isn't one.
			assert.throws(() => field.at(0));
		});

		it("boxedAt", () => {
			// Invalid to request the value if there isn't one.
			assert.throws(() => field.boxedAt(0));
		});

		it("length", () => {
			assert.equal(field.length, 0);
		});

		it("map", () => {
			assert.deepEqual(
				field.map((value) => value),
				[],
			);
		});

		it("mapBoxed", () => {
			assert.deepEqual(
				field.mapBoxed((value) => value),
				[],
			);
		});
	});
});

describe("LazyValueField", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = SchemaBuilder.fieldRequired(leafDomain.string);
	const schema = builder.toDocumentSchema(rootSchema);

	const initialTree = "Hello world";

	const { context, cursor } = initializeTreeWithContent({ schema, initialTree });

	const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

	it("at", () => {
		assert.equal(field.at(0), initialTree);
	});

	it("boxedAt", () => {
		const boxedResult = field.boxedAt(0);
		assert.equal(boxedResult.type, leafDomain.string.name);
		assert.equal(boxedResult.value, initialTree);
	});

	it("length", () => {
		assert.equal(field.length, 1);
	});

	it("map", () => {
		assert.deepEqual(
			field.map((value) => value),
			[initialTree],
		);
	});

	it("mapBoxed", () => {
		const mapResult = field.mapBoxed((value) => value);
		assert.equal(mapResult.length, 1);
		assert.equal(mapResult[0].value, initialTree);
	});
});

describe("LazySequence", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = SchemaBuilder.fieldSequence(leafDomain.number);
	const schema = builder.toDocumentSchema(rootSchema);

	const { context, cursor } = initializeTreeWithContent({
		schema,
		initialTree: [37, 42],
	});

	const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

	it("at", () => {
		assert.equal(sequence.length, 2);
		assert.equal(sequence.at(0), 37);
		assert.equal(sequence.at(1), 42);
		assert.throws(() => sequence.at(2));
	});

	it("boxedAt", () => {
		const boxedResult0 = sequence.boxedAt(0);
		assert.equal(boxedResult0.type, leafDomain.number.name);
		assert.equal(boxedResult0.value, 37);

		const boxedResult1 = sequence.boxedAt(1);
		assert.equal(boxedResult1.type, leafDomain.number.name);
		assert.equal(boxedResult1.value, 42);

		assert.throws(() => sequence.boxedAt(2));
	});

	it("length", () => {
		assert.equal(sequence.length, 2);
	});

	it("map", () => {
		const mapResult = sequence.map((value) => value);
		assert.equal(mapResult.length, 2);
		assert.equal(mapResult[0], 37);
		assert.equal(mapResult[1], 42);
	});

	it("mapBoxed", () => {
		const mapResult = sequence.mapBoxed((value) => value);
		assert.equal(mapResult.length, 2);
		assert.equal(mapResult[0].type, leafDomain.number.name);
		assert.equal(mapResult[0].value, 37);
		assert.equal(mapResult[1].type, leafDomain.number.name);
		assert.equal(mapResult[1].value, 42);
	});

	it("asArray", () => {
		const array = sequence.asArray;
		assert.equal(array.length, 2);
		assert.equal(array[0], 37);
		assert.equal(array[1], 42);
	});
});
