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
} from "../../../feature-libraries";
import {
	FieldAnchor,
	FieldKey,
	type IEditableForest,
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
import { getReadonlyContext } from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };
const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

// Mocks the ID representing a Fluid handle for test-purposes.
// const mockFluidHandle = new MockHandle(5) as IFluidHandle;

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder("lazyTree");
		builder.struct("empty", {});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = context.forest.allocateCursor();
		assert.equal(
			forest.tryMoveCursorToField(detachedFieldAnchor, cursor),
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

describe("LazyOptionalField", () => {
	describe("as", () => {
		it("Any", () => {
			const builder = new SchemaBuilder("test");
			const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);

			const { context, cursor } = createSingleValueTree(
				builder,
				SchemaBuilder.fieldOptional(builder.struct("struct", {})),
				{},
			);

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

			const { context, cursor } = createSingleValueTree(
				builder,
				SchemaBuilder.fieldOptional(builder.struct("struct", {})),
				{},
			);

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
			// assert.equal(
			// 	field.is(SchemaBuilder.fieldRecursive(FieldKinds.optional, numberLeafSchema)),
			// 	false,
			// );
		});

		// TODO: what other cases are interesting?
	});

	describe("length", () => {
		it("No value", () => {
			const builder = new SchemaBuilder("test");
			const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
			const rootSchema = SchemaBuilder.fieldOptional(numberLeafSchema);

			const { context, cursor } = createSingleValueTree(builder, rootSchema, undefined);

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

			const { context, cursor } = createSingleValueTree(builder, rootSchema, 42);

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

		const { context, cursor } = createSingleValueTree(builder, rootSchema, initialTree);

		return new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(leafSchema),
			cursor,
			rootFieldAnchor,
		);
	}

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

		const { context, cursor } = createSingleValueTree(builder, rootSchema, initialTree);

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

		it("Non-primitive field", () => {
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

		it("Non-primitive field", () => {
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
