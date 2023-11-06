/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";

import { TreeContent } from "../../../shared-tree";
import { type AllowedTypes, Any, type FieldKind, FieldKinds } from "../../../feature-libraries";
import {
	FieldAnchor,
	FieldKey,
	type ITreeSubscriptionCursor,
	rootFieldKey,
	TreeNavigationResult,
	UpPath,
} from "../../../core";
import { forestWithContent } from "../../utils";
import { leaf as leafDomain, SchemaBuilder } from "../../../domains";
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
		builder.object("empty", {});
		const schema = builder.intoSchema(SchemaBuilder.optional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = initializeCursor(context, detachedFieldAnchor);

		const sequenceField = new LazySequence(
			context,
			SchemaBuilder.sequence(Any),
			cursor,
			detachedFieldAnchor,
		);
		const optionalField = new LazyOptionalField(
			context,
			SchemaBuilder.optional(Any),
			cursor,
			detachedFieldAnchor,
		);
		const valueField = new LazyValueField(
			context,
			SchemaBuilder.required(Any),
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
		const rootSchema = SchemaBuilder.optional(builder.object("object", {}));
		const schema = builder.intoSchema(rootSchema);

		// Note: this tree initialization is strictly to enable construction of the lazy field.
		// The test cases below are strictly in terms of the schema of the created fields.
		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });

		// #endregion

		// #region OptionalField<Any>

		const anyOptionalField = new TestLazyField(
			context,
			SchemaBuilder.optional(Any),
			cursor,
			detachedFieldAnchor,
		);

		assert(anyOptionalField.is(SchemaBuilder.optional(Any)));

		assert(!anyOptionalField.is(SchemaBuilder.optional([])));
		assert(!anyOptionalField.is(SchemaBuilder.optional(leafDomain.boolean)));
		assert(!anyOptionalField.is(SchemaBuilder.required([])));
		assert(!anyOptionalField.is(SchemaBuilder.required(Any)));
		assert(!anyOptionalField.is(SchemaBuilder.required(leafDomain.boolean)));
		assert(!anyOptionalField.is(SchemaBuilder.sequence([])));
		assert(!anyOptionalField.is(SchemaBuilder.sequence(Any)));
		assert(!anyOptionalField.is(SchemaBuilder.sequence(leafDomain.boolean)));

		// #endregion

		// #region OptionalField<Primitive>

		const booleanOptionalField = new LazyOptionalField(
			context,
			SchemaBuilder.optional(leafDomain.boolean),
			cursor,
			detachedFieldAnchor,
		);

		assert(booleanOptionalField.is(SchemaBuilder.optional(leafDomain.boolean)));

		assert(!booleanOptionalField.is(SchemaBuilder.optional(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.optional(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.required([])));
		assert(!booleanOptionalField.is(SchemaBuilder.required(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.required(leafDomain.boolean)));
		assert(!booleanOptionalField.is(SchemaBuilder.required(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence([])));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence(leafDomain.boolean)));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.optional([])));

		// #endregion
	});

	it("parent", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const struct = builder.object("object", {
			foo: SchemaBuilder.optional(leafDomain.primitives),
		});
		const rootSchema = SchemaBuilder.optional(struct);
		const schema = builder.intoSchema(rootSchema);

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
			SchemaBuilder.optional(leafDomain.primitives),
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
	const rootSchema = SchemaBuilder.optional(leafDomain.number);
	const schema = builder.intoSchema(rootSchema);

	describe("Field with value", () => {
		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });
		const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

		it("atIndex", () => {
			assert.equal(field.atIndex(0), 42);
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

		it("atIndex", () => {
			// Invalid to request the value if there isn't one.
			assert.throws(() => field.atIndex(0));
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
	const rootSchema = SchemaBuilder.required(leafDomain.string);
	const schema = builder.intoSchema(rootSchema);

	const initialTree = "Hello world";

	const { context, cursor } = initializeTreeWithContent({ schema, initialTree });

	const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

	it("atIndex", () => {
		assert.equal(field.atIndex(0), initialTree);
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
	const rootSchema = SchemaBuilder.sequence(leafDomain.number);
	const schema = builder.intoSchema(rootSchema);

	const { context, cursor } = initializeTreeWithContent({
		schema,
		initialTree: [37, 42],
	});

	const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

	it("atIndex", () => {
		assert.equal(sequence.length, 2);
		assert.equal(sequence.atIndex(0), 37);
		assert.equal(sequence.atIndex(1), 42);
		assert.throws(() => sequence.atIndex(2));
	});

	it("at", () => {
		assert.equal(sequence.length, 2);
		assert.equal(sequence.at(0), 37);
		assert.equal(sequence.at(1), 42);
		assert.equal(sequence.at(-1), 42); // Negative index > -sequence.length
		assert.equal(sequence.at(-2), 37); // Negative index > -sequence.length
		assert.equal(sequence.at(2), undefined); // Positive index >= sequence.length
		assert.equal(sequence.at(-3), undefined); // Negative index < -sequence.length
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
