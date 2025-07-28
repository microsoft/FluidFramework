/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import type {
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
} from "../../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { IdentifierToken } from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";
import {
	type FieldBatchEncodingContext,
	makeFieldBatchCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	AnyShape,
	EncoderContext,
	type FieldEncoder,
	type NodeEncoder,
	anyFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { NodeShapeBasedEncoder } from "../../../../feature-libraries/chunked-forest/codec/nodeEncoder.js";
import {
	buildContext,
	fieldShaper,
	oneFromSet,
	treeShaper,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { FieldKinds, fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import {
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	defaultSchemaPolicy,
} from "../../../../feature-libraries/index.js";
import { type JsonCompatibleReadOnly, brand } from "../../../../util/index.js";
import { ajvValidator } from "../../../codec/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../../snapshots/index.js";
import {
	HasOptionalField,
	Minimal,
	NumericMap,
	RecursiveType,
	testTrees,
} from "../../../testTrees.js";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities.js";

import { checkFieldEncode, checkNodeEncode } from "./checkEncode.js";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { assertIsSessionId, testIdCompressor } from "../../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { SpecialField } from "../../../../feature-libraries/chunked-forest/codec/format.js";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	getStoredSchema,
	toStoredSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../simple-tree/toStoredSchema.js";
import { numberSchema, stringSchema } from "../../../../simple-tree/index.js";

const anyNodeShape = new NodeShapeBasedEncoder(undefined, undefined, [], anyFieldEncoder);
const onlyTypeShape = new NodeShapeBasedEncoder(undefined, false, [], undefined);
const numericShape = new NodeShapeBasedEncoder(
	brand(numberSchema.identifier),
	true,
	[],
	undefined,
);
const identifierShape = new NodeShapeBasedEncoder(
	brand(stringSchema.identifier),
	SpecialField.Identifier,
	[],
	undefined,
);

describe("schemaBasedEncoding", () => {
	it("oneFromSet", () => {
		assert.equal(oneFromSet(undefined), undefined);
		assert.equal(oneFromSet(new Set([5])), 5);
		assert.equal(oneFromSet(new Set([1, 2])), undefined);
	});

	describe("fieldShaper", () => {
		it("monomorphic-value", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				toStoredSchema(Minimal).rootFieldSchema,
				context,
				{ nodeSchema: new Map() },
			);
			// This is expected since this case should be optimized to just encode the inner shape.
			assert.equal(shape.shape, onlyTypeShape);
			const buffer = checkFieldEncode(shape, context, [
				{
					type: brand(Minimal.identifier),
				},
			]);
			assert.deepEqual(buffer, [new IdentifierToken("test.minimal")]);
		});

		it("polymorphic-value", () => {
			const context = new EncoderContext(
				() => anyNodeShape,
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				toStoredSchema([Minimal, numberSchema]).rootFieldSchema,
				context,
				{ nodeSchema: new Map() },
			);
			// There are multiple choices about how this case should be optimized, but the current implementation does this:
			assert.equal(shape.shape, AnyShape.instance);
			checkFieldEncode(shape, context, [{ type: brand(Minimal.identifier) }]);
			checkFieldEncode(shape, context, [{ type: brand("numeric"), value: 1 }]);
		});

		it("sequence", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				{
					kind: FieldKinds.sequence.identifier,
					types: new Set([brand(Minimal.identifier)]),
					persistedMetadata: undefined,
				},
				context,
				{ nodeSchema: new Map() },
			);
			// There are multiple choices about how this case should be optimized, but the current implementation does this:
			assert.equal(shape.shape, context.nestedArrayEncoder(onlyTypeShape));
			assert.deepEqual(checkFieldEncode(shape, context, []), [0]);
			assert.deepEqual(
				checkFieldEncode(shape, context, [{ type: brand(Minimal.identifier) }]),
				[[new IdentifierToken("test.minimal")]],
			);
			assert.deepEqual(
				checkFieldEncode(shape, context, [
					{ type: brand(Minimal.identifier) },
					{ type: brand(Minimal.identifier) },
				]),
				[[new IdentifierToken("test.minimal"), new IdentifierToken("test.minimal")]],
			);
		});

		it("identifier", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const log: string[] = [];
			const storedSchema: TreeFieldStoredSchema = {
				kind: FieldKinds.identifier.identifier,
				types: new Set([brand(stringSchema.identifier)]),
				persistedMetadata: undefined,
			};

			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return identifierShape;
					},
				},
				storedSchema,
				context,
				{
					nodeSchema: new Map([
						[brand(stringSchema.identifier), getStoredSchema(stringSchema)],
					]),
				},
			);
			const compressedId = testIdCompressor.generateCompressedId();
			const stableId = testIdCompressor.decompress(compressedId);
			assert.deepEqual(shape.shape, identifierShape);
			assert.deepEqual(
				checkFieldEncode(shape, context, [
					{ type: brand(stringSchema.identifier), value: stableId },
				]),
				[compressedId],
			);
		});
	});

	describe("treeShaper", () => {
		it("minimal", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const shape = treeShaper(
				toStoredSchema(Minimal),
				defaultSchemaPolicy,
				{ shapeFromField: () => fail() },
				brand(Minimal.identifier),
			);
			const buffer = checkNodeEncode(shape, context, { type: brand(Minimal.identifier) });
			assert.deepEqual(buffer, []);
		});

		it("hasOptionalField", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const log: TreeFieldStoredSchema[] = [];
			const shape = treeShaper(
				toStoredSchema(HasOptionalField),
				defaultSchemaPolicy,
				{
					shapeFromField(field: TreeFieldStoredSchema): FieldEncoder {
						log.push(field);
						return context.nestedArrayEncoder(numericShape);
					},
				},
				brand(HasOptionalField.identifier),
			);
			assert.deepEqual(
				shape,
				new NodeShapeBasedEncoder(
					brand(HasOptionalField.identifier),
					false,
					[{ key: brand("field"), encoder: context.nestedArrayEncoder(numericShape) }],
					undefined,
				),
			);
			const bufferEmpty = checkNodeEncode(shape, context, {
				type: brand(HasOptionalField.identifier),
			});
			assert.deepEqual(bufferEmpty, [0]);
			const bufferFull = checkNodeEncode(shape, context, {
				type: brand(HasOptionalField.identifier),
				fields: { field: [{ type: brand(numberSchema.identifier), value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[5]]);
		});

		it("hasExtraField", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
			);
			const log: TreeFieldStoredSchema[] = [];
			const shape = treeShaper(
				toStoredSchema(NumericMap),
				defaultSchemaPolicy,
				{
					shapeFromField(field: TreeFieldStoredSchema): FieldEncoder {
						log.push(field);
						return context.nestedArrayEncoder(numericShape);
					},
				},
				brand(NumericMap.identifier),
			);
			assert.deepEqual(
				shape,
				new NodeShapeBasedEncoder(
					brand(NumericMap.identifier),
					false,
					[],
					context.nestedArrayEncoder(numericShape),
				),
			);
			const bufferEmpty = checkNodeEncode(shape, context, {
				type: brand(NumericMap.identifier),
			});
			assert.deepEqual(bufferEmpty, [[]]);
			const bufferFull = checkNodeEncode(shape, context, {
				type: brand(NumericMap.identifier),
				fields: { extra: [{ type: brand(numberSchema.identifier), value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[new IdentifierToken("extra"), [5]]]);
		});
	});

	it("recursiveType", () => {
		const context = buildContext(
			toStoredSchema(RecursiveType),
			defaultSchemaPolicy,
			testIdCompressor,
		);
		const shape = context.shapeFromTree(brand(RecursiveType.identifier));
		const bufferEmpty = checkNodeEncode(shape, context, {
			type: brand(RecursiveType.identifier),
		});
		assert.deepEqual(bufferEmpty, [0]);
		const bufferFull = checkNodeEncode(shape, context, {
			type: brand(RecursiveType.identifier),
			fields: { field: [{ type: brand(RecursiveType.identifier) }] },
		});
		assert.deepEqual(bufferFull, [[0]]);
	});

	describe("test trees", () => {
		useSnapshotDirectory("chunked-forest-schema-compressed");
		// TODO: test non size 1 batches
		for (const { name, treeFactory, schemaData } of testTrees) {
			it(name, () => {
				const idCompressor = createIdCompressor(
					assertIsSessionId("00000000-0000-4000-b000-000000000000"),
				);
				const storedSchema = schemaData;
				const tree = treeFactory(idCompressor);
				// Check with checkFieldEncode
				const context = buildContext(storedSchema, defaultSchemaPolicy, idCompressor);
				checkFieldEncode(anyFieldEncoder, context, tree, idCompressor);

				const fieldBatchContext: FieldBatchEncodingContext = {
					encodeType: TreeCompressionStrategy.Compressed,
					originatorId: testIdCompressor.localSessionId,
					schema: { schema: storedSchema, policy: defaultSchemaPolicy },
					idCompressor,
				};
				idCompressor.finalizeCreationRange(idCompressor.takeNextCreationRange());
				const codec = makeFieldBatchCodec({ jsonValidator: ajvValidator }, 1);
				// End to end test
				// rootFieldSchema is not being used in encoding, so we currently have some limitations. Schema based optimizations for root case don't trigger.
				const encoded = codec.encode([cursorForJsonableTreeField(tree)], fieldBatchContext);
				const result = codec.decode(encoded, fieldBatchContext);
				const resultTree = result.map(jsonableTreesFromFieldCursor);
				assert.deepEqual(resultTree, [tree]);

				// This snapshot makes it clear when the format changes.
				// This can include compression/heuristic changes which are non breaking,
				// but does not handle ensuring different old versions stull load (for example encoded with different heuristics).
				// TODO: add a new test suite with a library of encoded test data which we can parse to cover that.

				const dataStr = JSON.stringify(
					encoded,
					// The mock handle doesn't stringify deterministically, so replace it:
					(key, value: JsonCompatibleReadOnly) =>
						isFluidHandle(value) ? "Handle Placeholder" : value,
					2,
				);
				takeJsonSnapshot(JSON.parse(dataStr));
			});
		}
	});
});
