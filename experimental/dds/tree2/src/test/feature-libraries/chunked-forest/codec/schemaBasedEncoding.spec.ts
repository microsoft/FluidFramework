/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import {
	FieldStoredSchema,
	JsonableTree,
	SchemaDataAndPolicy,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../../../../core";
import {
	Any,
	FieldKinds,
	FieldSchema,
	FullSchemaPolicy,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
	cursorsForTypedFieldData,
	jsonableTreeFromCursor,
	typeNameSymbol,
	valueSymbol,
} from "../../../../feature-libraries";

import {
	buildCache,
	fieldShaper,
	oneFromSet,
	schemaCompressedEncode,
	treeShaper,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncoding";

import {
	AnyShape,
	EncoderCache,
	FieldEncoderShape,
	NodeEncoderShape,
	anyFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import { brand } from "../../../../util";
// eslint-disable-next-line import/no-internal-modules
import { NodeShape } from "../../../../feature-libraries/chunked-forest/codec/nodeShape";
// eslint-disable-next-line import/no-internal-modules
import { IdentifierToken } from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";
import { assertChunkCursorEquals, fieldCursorFromJsonableTrees } from "../fieldCursorTestUtilities";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding";
import { checkFieldEncode, checkNodeEncode } from "./checkEncode";

interface TestTree {
	readonly name: string;
	readonly schemaData: SchemaDataAndPolicy<FullSchemaPolicy>;
	readonly schema: FieldSchema;
	readonly tree: JsonableTree[];
}

export function testTree<T extends TreeSchema>(
	name: string,
	schemaData: SchemaDataAndPolicy<FullSchemaPolicy>,
	schema: T,
	data: SchemaAware.AllowedTypesToTypedTrees<SchemaAware.ApiMode.Flexible, [T]>,
): TestTree {
	const fieldSchema = SchemaBuilder.fieldValue(schema);
	return testField(name, schemaData, fieldSchema, data);
}

function testField<T extends FieldSchema>(
	name: string,
	schemaData: SchemaDataAndPolicy<FullSchemaPolicy>,
	schema: T,
	data: SchemaAware.TypedField<T, SchemaAware.ApiMode.Flexible>,
): TestTree {
	const cursors = cursorsForTypedFieldData({ schema: schemaData }, schema, data);
	return { name, schema, tree: cursors.map(jsonableTreeFromCursor), schemaData };
}

const builder = new SchemaBuilder("test");
const minimal = builder.object("minimal", {});
const numeric = builder.primitive("numeric", ValueSchema.Number);
const serializable = builder.object("serializable", { value: ValueSchema.Serializable });
const hasMinimalValueField = builder.object("hasMinimalValueField", {
	local: { field: SchemaBuilder.fieldValue(minimal) },
});
const hasNumericValueField = builder.object("hasNumericValueField", {
	local: { field: SchemaBuilder.fieldValue(numeric) },
});
const hasPolymorphicValueField = builder.object("hasPolymorphicValueField", {
	local: { field: SchemaBuilder.fieldValue(numeric, minimal) },
});
const hasAnyValueField = builder.object("hasAnyValueField", {
	local: { field: SchemaBuilder.fieldValue(Any) },
});
const hasOptionalField = builder.object("hasOptionalField", {
	local: { field: SchemaBuilder.fieldOptional(numeric) },
});
const hasExtraLocalFields = builder.object("hasExtraLocalFields", {
	extraLocalFields: SchemaBuilder.fieldOptional(numeric),
});
const globalNumericField = builder.globalField(
	"global_numeric",
	SchemaBuilder.fieldOptional(numeric),
);
const globalAnyField = builder.globalField("global_any", SchemaBuilder.fieldSequence(Any));
const hasGlobalField = builder.object("hasGlobalField", {
	global: [globalNumericField] as const,
});
const hasExtraGlobalField = builder.object("hasExtraGlobalField", {
	extraGlobalFields: true,
});
const allTheFields = builder.object("allTheFields", {
	local: {
		optional: SchemaBuilder.fieldOptional(numeric),
		value: SchemaBuilder.fieldValue(numeric),
		sequence: SchemaBuilder.fieldSequence(numeric),
	},
	global: [globalNumericField] as const,
	extraLocalFields: SchemaBuilder.fieldOptional(numeric),
	extraGlobalFields: true,
});
const anyFields = builder.object("anyFields", {
	local: {
		optional: SchemaBuilder.fieldOptional(Any),
		value: SchemaBuilder.fieldValue(Any),
		sequence: SchemaBuilder.fieldSequence(Any),
	},
	global: [globalAnyField] as const,
	extraLocalFields: SchemaBuilder.fieldOptional(Any),
	extraGlobalFields: true,
	value: ValueSchema.Serializable,
});
const recursiveType = builder.objectRecursive("recursiveType", {
	local: {
		field: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => recursiveType),
	},
});

const library = builder.intoLibrary();

export const testTrees: readonly TestTree[] = [
	testField("empty", library, SchemaBuilder.fieldOptional(), undefined),
	testTree("minimal", library, minimal, {}),
	testTree("numeric", library, numeric, 5),
	testField("numericSequence", library, SchemaBuilder.fieldSequence(numeric), [1, 2, 3]),
	testTree("true boolean", library, serializable, {
		[typeNameSymbol]: "serializable",
		[valueSymbol]: true,
	}),
	testTree("false boolean", library, serializable, {
		[typeNameSymbol]: "serializable",
		[valueSymbol]: false,
	}),
	testTree("hasMinimalValueField", library, hasMinimalValueField, {
		field: {},
	}),
	testTree("hasNumericValueField", library, hasNumericValueField, {
		field: 5,
	}),
	testTree("hasPolymorphicValueField", library, hasPolymorphicValueField, {
		field: 5,
	}),
	testTree("hasAnyValueField", library, hasAnyValueField, {
		field: {
			[typeNameSymbol]: "numeric",
			[valueSymbol]: 5,
		},
	}),
	testTree("hasAnyValueFieldRecursive", library, hasAnyValueField, {
		field: {
			[typeNameSymbol]: "hasAnyValueField",
			field: {
				[typeNameSymbol]: "numeric",
				[valueSymbol]: 5,
			},
		},
	}),
	testTree("hasOptionalField-empty", library, hasOptionalField, { field: undefined }),
	testTree("hasExtraLocalFields-none", library, hasExtraLocalFields, {}),
	testTree("hasGlobalField", library, hasGlobalField, { [globalNumericField.symbol]: 5 }),
	testTree("hasExtraGlobalField", library, hasExtraGlobalField, {
		[globalNumericField.symbol]: 5,
	}),
	testTree("hasExtraGlobalField-empty", library, hasExtraGlobalField, {}),
	testTree("allTheFields-minimal", library, allTheFields, {
		value: 5,
		optional: undefined,
		sequence: [],
	}),
	testTree("allTheFields-full", library, allTheFields, {
		value: 5,
		optional: 5,
		sequence: [5],
		[globalNumericField.symbol]: 5,
	}),
	testTree("anyFields-minimal", library, anyFields, {
		value: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		optional: undefined,
		sequence: [],
	}),
	testTree("anyFields-full", library, anyFields, {
		value: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		optional: { [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
		sequence: [
			{ [typeNameSymbol]: numeric.name, [valueSymbol]: 5 },
			{ [typeNameSymbol]: minimal.name },
		],
		[globalNumericField.symbol]: 5,
		[valueSymbol]: "value",
	}),
	testTree("recursiveType-empty", library, recursiveType, { field: undefined }),
	testTree("recursiveType-recursive", library, recursiveType, { field: { field: undefined } }),
	testTree("recursiveType-deeper", library, recursiveType, {
		field: { field: { field: { field: undefined } } },
	}),
];

// TODO: integrate data sources for wide and deep trees from ops size testing and large data generators for cursor performance testing.
// TODO: whiteboard like data with near term and eventual schema approaches

const anyNodeShape = new NodeShape(undefined, undefined, [], [], anyFieldEncoder, anyFieldEncoder);
const onlyTypeShape = new NodeShape(undefined, false, [], [], undefined, undefined);
const numericShape = new NodeShape(numeric.name, true, [], [], undefined, undefined);

describe("schemaBasedEncoding", () => {
	it("oneFromSet", () => {
		assert.equal(oneFromSet(undefined), undefined);
		assert.equal(oneFromSet(new Set([5])), 5);
		assert.equal(oneFromSet(new Set([1, 2])), undefined);
	});

	describe("fieldShaper", () => {
		it("monomorphic-value", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoderShape {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				SchemaBuilder.fieldValue(minimal),
				cache,
			);
			// This is expected since this case should be optimized to just encode the inner shape.
			assert.equal(shape.shape, onlyTypeShape);
			const buffer = checkFieldEncode(shape, cache, [
				{
					type: minimal.name,
				},
			]);
			assert.deepEqual(buffer, [new IdentifierToken("minimal")]);
		});

		it("polymorphic-value", () => {
			const cache = new EncoderCache(
				() => anyNodeShape,
				() => fail(),
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoderShape {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				SchemaBuilder.fieldValue(minimal, numeric),
				cache,
			);
			// There are multiple choices about how this case should be optimized, but the current implementation does this:
			assert.equal(shape.shape, AnyShape.instance);
			checkFieldEncode(shape, cache, [{ type: minimal.name }]);
			checkFieldEncode(shape, cache, [{ type: brand("numeric"), value: 1 }]);
		});

		it("sequence", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoderShape {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				SchemaBuilder.fieldSequence(minimal),
				cache,
			);
			// There are multiple choices about how this case should be optimized, but the current implementation does this:
			assert.equal(shape.shape, cache.nestedArray(onlyTypeShape));
			assert.deepEqual(checkFieldEncode(shape, cache, []), [0]);
			assert.deepEqual(checkFieldEncode(shape, cache, [{ type: minimal.name }]), [
				[new IdentifierToken("minimal")],
			]);
			assert.deepEqual(
				checkFieldEncode(shape, cache, [{ type: minimal.name }, { type: minimal.name }]),
				[[new IdentifierToken("minimal"), new IdentifierToken("minimal")]],
			);
		});
	});

	describe("treeShaper", () => {
		it("minimal", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);
			const shape = treeShaper(library, { shapeFromField: () => fail() }, minimal.name);
			const buffer = checkNodeEncode(shape, cache, { type: minimal.name });
			assert.deepEqual(buffer, []);
		});

		it("hasOptionalField", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);
			const log: FieldStoredSchema[] = [];
			const shape = treeShaper(
				library,
				{
					shapeFromField(field: FieldStoredSchema): FieldEncoderShape {
						log.push(field);
						return cache.nestedArray(numericShape);
					},
				},
				hasOptionalField.name,
			);
			assert.deepEqual(
				shape,
				new NodeShape(
					hasOptionalField.name,
					false,
					[{ key: brand("field"), shape: cache.nestedArray(numericShape) }],
					[],
					undefined,
					undefined,
				),
			);
			const bufferEmpty = checkNodeEncode(shape, cache, { type: hasOptionalField.name });
			assert.deepEqual(bufferEmpty, [0]);
			const bufferFull = checkNodeEncode(shape, cache, {
				type: hasOptionalField.name,
				fields: { field: [{ type: numeric.name, value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[5]]);
		});

		it("hasExtraField", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
			);
			const log: FieldStoredSchema[] = [];
			const shape = treeShaper(
				library,
				{
					shapeFromField(field: FieldStoredSchema): FieldEncoderShape {
						log.push(field);
						return cache.nestedArray(numericShape);
					},
				},
				hasExtraLocalFields.name,
			);
			assert.deepEqual(
				shape,
				new NodeShape(
					hasExtraLocalFields.name,
					false,
					[],
					[],
					cache.nestedArray(numericShape),
					undefined,
				),
			);
			const bufferEmpty = checkNodeEncode(shape, cache, { type: hasExtraLocalFields.name });
			assert.deepEqual(bufferEmpty, [[]]);
			const bufferFull = checkNodeEncode(shape, cache, {
				type: hasExtraLocalFields.name,
				fields: { extra: [{ type: numeric.name, value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[new IdentifierToken("extra"), [5]]]);
		});
	});

	it("recursiveType", () => {
		const cache = buildCache(library);
		const shape = cache.shapeFromTree(recursiveType.name);
		const bufferEmpty = checkNodeEncode(shape, cache, { type: recursiveType.name });
		assert.deepEqual(bufferEmpty, [0]);
		const bufferFull = checkNodeEncode(shape, cache, {
			type: recursiveType.name,
			fields: { field: [{ type: recursiveType.name }] },
		});
		assert.deepEqual(bufferFull, [[0]]);
	});

	describe("test trees", () => {
		for (const { name, schema, tree, schemaData } of testTrees) {
			it(name, () => {
				// Check with checkFieldEncode
				const cache = buildCache(schemaData);
				checkFieldEncode(anyFieldEncoder, cache, tree);

				// End to end test
				const encoded = schemaCompressedEncode(
					schemaData,
					fieldCursorFromJsonableTrees(tree),
				);
				const json = JSON.stringify(encoded);
				const parsed = JSON.parse(json);
				const result = decode(parsed);
				assertChunkCursorEquals(result, tree);
			});
		}
	});
});
