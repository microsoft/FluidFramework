/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

// import { IFluidHandle } from "@fluidframework/core-interfaces";
// import { MockHandle } from "@fluidframework/test-runtime-utils";

import {
	type AllowedTypes,
	Any,
	type FieldKind,
	FieldKinds,
	FieldSchema,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
	type TypedSchemaCollection,
} from "../../../feature-libraries";
import {
	FieldAnchor,
	FieldKey,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	rootFieldKey,
	TreeNavigationResult,
	ValueSchema,
} from "../../../core";
import { forestWithContent } from "../../utils";
import { brand } from "../../../util";
import { type Context } from "../../../feature-libraries/editable-tree-2/context";
import {
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/editable-tree-2/lazyField";
import { contextWithContentReadonly, getReadonlyContext } from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };
const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

// Mocks the ID representing a Fluid handle for test-purposes.
// const mockFluidHandle = new MockHandle(5) as IFluidHandle;

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.forest.allocateCursor();

	assert.equal(context.forest.tryMoveCursorToField(anchor, cursor), TreeNavigationResult.Ok);
	return cursor;
}

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder("lazyTree");
		builder.struct("empty", {});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
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

/**
 * Initializes the tree, context, and cursor, and moves the cursor to the tree root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FieldKind, Types extends AllowedTypes>(
	schema: TypedSchemaCollection,
	initialTree?:
		| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly({ schema, initialTree });
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

describe.only("LazyOptionalField", () => {
	describe("as", () => {
		it("Any", () => {
			const builder = new SchemaBuilder("test");
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
			const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
				flag: SchemaBuilder.fieldValue(booleanLeafSchema),
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => recursiveStructSchema,
				),
			});
			const rootSchema = SchemaBuilder.fieldOptional(builder.struct("struct", {}));
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent(schema, {});

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
			assert(
				!field.is(SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema)),
			);
		});

		it("Boolean", () => {
			const builder = new SchemaBuilder("test");
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
			const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
			const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
				flag: SchemaBuilder.fieldValue(booleanLeafSchema),
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => recursiveStructSchema,
				),
			});
			const rootSchema = SchemaBuilder.fieldOptional(builder.struct("struct", {}));
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent(schema, {});

			assert.equal(
				context.forest.tryMoveCursorToField(detachedFieldAnchor, cursor),
				TreeNavigationResult.Ok,
			);

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
			assert(
				!field.is(SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema)),
			);
		});

		// TODO: what other cases are interesting?
	});

	describe("length", () => {
		it("No value", () => {
			const builder = new SchemaBuilder("test");
			const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
			const rootSchema = SchemaBuilder.fieldOptional(numberLeafSchema);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent(schema, undefined);

			const field = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(Any),
				cursor,
				rootFieldAnchor,
			);

			assert.equal(field.length, 0);
		});

		it("With value", () => {
			const builder = new SchemaBuilder("test");
			const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
			const rootSchema = SchemaBuilder.fieldOptional(numberLeafSchema);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent(schema, 42);

			const field = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(numberLeafSchema),
				cursor,
				rootFieldAnchor,
			);

			assert.equal(field.length, 1);
		});
	});

	/**
	 * Creates a single-node, primitive tree, and returns a field associated with that node.
	 */
	function createPrimitiveField(
		kind: ValueSchema,
		initialTree?:
			| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
			| readonly ITreeCursorSynchronous[]
			| ITreeCursorSynchronous,
	): LazyOptionalField<[TreeSchema<"leaf">]> {
		const builder = new SchemaBuilder("test");
		const leafSchema = builder.leaf("leaf", kind);
		const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
		const schema = builder.intoDocumentSchema(rootSchema);

		const { context, cursor } = initializeTreeWithContent(schema, initialTree);

		return new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(leafSchema),
			cursor,
			rootFieldAnchor,
		);
	}

	/**
	 * Creates a single-node, struct tree, and returns a field associated with that node.
	 */
	function createStructField(
		initialTree?:
			| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
			| readonly ITreeCursorSynchronous[]
			| ITreeCursorSynchronous,
	): LazyOptionalField<[TreeSchema<"struct">]> {
		const builder = new SchemaBuilder("test");
		const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
		const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
		const leafSchema = builder.struct("struct", {
			foo: SchemaBuilder.fieldValue(booleanLeafSchema),
			bar: SchemaBuilder.fieldOptional(numberLeafSchema),
		});
		const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
		const schema = builder.intoDocumentSchema(rootSchema);

		const { context, cursor } = initializeTreeWithContent(schema, initialTree);

		return new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(leafSchema),
			cursor,
			rootFieldAnchor,
		);
	}

	describe("map", () => {
		it("boolean", () => {
			const field = createPrimitiveField(ValueSchema.Boolean, false);

			assert.deepEqual(
				field.map((value) => value),
				[false],
			);
		});

		it("number", () => {
			const field = createPrimitiveField(ValueSchema.Number, 42);

			assert.deepEqual(
				field.map((value) => value),
				[42],
			);
		});

		it("string", () => {
			const field = createPrimitiveField(ValueSchema.String, "Hello world");

			assert.deepEqual(
				field.map((value) => value),
				["Hello world"],
			);
		});

		// TODO: current types don't allow fluid handle
		// it("Fluid Handle", () => {
		// 	const field = createPrimitiveField(ValueSchema.FluidHandle, mockFluidHandle);

		// 	assert.deepEqual(
		// 		field.map((value) => value),
		// 		[mockFluidHandle],
		// 	);
		// });

		it("No value", () => {
			const field = createPrimitiveField(ValueSchema.Number, undefined);

			assert.deepEqual(
				field.map((value) => value),
				[],
			);
		});

		it("Struct", () => {
			const input = {
				foo: true,
				bar: 42,
			};
			const field = createStructField(input);

			const mapResult = field.map((value) => value);

			assert.equal(mapResult.length, 1);
			assert.notEqual(mapResult[0], undefined);
			assert.equal((mapResult[0] as any).foo, true);
			assert.equal((mapResult[0] as any).bar, 42);
		});
	});

	describe("mapBoxed", () => {
		it("number", () => {
			const field = createPrimitiveField(ValueSchema.Number, 42);

			const mapResult = field.mapBoxed((value) => value);
			assert.equal(mapResult.length, 1);
			assert.equal(mapResult[0].value, 42);
		});

		it("boolean", () => {
			const field = createPrimitiveField(ValueSchema.Boolean, true);

			const mapResult = field.mapBoxed((value) => value);
			assert.equal(mapResult.length, 1);
			assert.equal(mapResult[0].value, true);
		});

		it("string", () => {
			const field = createPrimitiveField(ValueSchema.String, "Hello world");

			const mapResult = field.mapBoxed((value) => value);
			assert.equal(mapResult.length, 1);
			assert.equal(mapResult[0].value, "Hello world");
		});

		// TODO: current types don't allow fluid handle
		// it("Fluid Handle", () => {
		// 	const field = createPrimitiveField(ValueSchema.FluidHandle, mockFluidHandle);

		// 	const mapResult = field.mapBoxed((value) => value);
		// 	assert.equal(mapResult.length, 1);
		// 	assert.equal(mapResult[0].value, mockFluidHandle);
		// });

		it("No value", () => {
			const field = createPrimitiveField(ValueSchema.String, undefined);

			const mapResult = field.mapBoxed((value) => value);
			assert.deepEqual(mapResult, []);
		});

		it("Struct", () => {
			const input = {
				foo: true,
				bar: 42,
			};
			const field = createStructField(input);

			const mapResult = field.mapBoxed((value) => value);

			assert.equal(mapResult.length, 1);
			assert.notEqual(mapResult[0], undefined);
			assert.equal((mapResult[0] as any).foo, input.foo);
			assert.equal((mapResult[0] as any).bar, input.bar);
		});
	});
});
