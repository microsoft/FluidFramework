/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { TreeFieldStoredSchema, TreeNodeSchemaIdentifier } from "../../../../core/index.js";
import {
	FlexFieldSchema,
	TreeCompressionStrategy,
	cursorForJsonableTreeField,
	defaultSchemaPolicy,
	intoStoredSchema,
	isFluidHandle,
} from "../../../../feature-libraries/index.js";

import { leaf } from "../../../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { IdentifierToken } from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";
import {
	FieldBatchEncodingContext,
	makeFieldBatchCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	AnyShape,
	EncoderCache,
	FieldEncoder,
	NodeEncoder,
	anyFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
// eslint-disable-next-line import/no-internal-modules
import { NodeShape } from "../../../../feature-libraries/chunked-forest/codec/nodeShape.js";
import {
	buildCache,
	fieldShaper,
	oneFromSet,
	treeShaper,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncoding.js";
// eslint-disable-next-line import/no-internal-modules
import { FieldKinds, fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import { JsonCompatibleReadOnly, brand } from "../../../../util/index.js";
import { ajvValidator } from "../../../codec/index.js";
import { takeSnapshot, useSnapshotDirectory } from "../../../snapshots/index.js";
import {
	hasOptionalField,
	minimal,
	numericMap,
	recursiveType,
	storedLibrary,
	testTrees,
} from "../../../testTrees.js";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities.js";
import { checkFieldEncode, checkNodeEncode } from "./checkEncode.js";

const anyNodeShape = new NodeShape(undefined, undefined, [], anyFieldEncoder);
const onlyTypeShape = new NodeShape(undefined, false, [], undefined);
const numericShape = new NodeShape(leaf.number.name, true, [], undefined);

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
				fieldKinds,
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				FlexFieldSchema.create(FieldKinds.required, [minimal]),
				cache,
			);
			// This is expected since this case should be optimized to just encode the inner shape.
			assert.equal(shape.shape, onlyTypeShape);
			const buffer = checkFieldEncode(shape, cache, [
				{
					type: minimal.name,
				},
			]);
			assert.deepEqual(buffer, [new IdentifierToken("test.minimal")]);
		});

		it("polymorphic-value", () => {
			const cache = new EncoderCache(
				() => anyNodeShape,
				() => fail(),
				fieldKinds,
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				FlexFieldSchema.create(FieldKinds.required, [minimal, leaf.number]),
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
				fieldKinds,
			);
			const log: string[] = [];
			const shape = fieldShaper(
				{
					shapeFromTree(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				FlexFieldSchema.create(FieldKinds.sequence, [minimal]),
				cache,
			);
			// There are multiple choices about how this case should be optimized, but the current implementation does this:
			assert.equal(shape.shape, cache.nestedArray(onlyTypeShape));
			assert.deepEqual(checkFieldEncode(shape, cache, []), [0]);
			assert.deepEqual(checkFieldEncode(shape, cache, [{ type: minimal.name }]), [
				[new IdentifierToken("test.minimal")],
			]);
			assert.deepEqual(
				checkFieldEncode(shape, cache, [{ type: minimal.name }, { type: minimal.name }]),
				[[new IdentifierToken("test.minimal"), new IdentifierToken("test.minimal")]],
			);
		});
	});

	describe("treeShaper", () => {
		it("minimal", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const shape = treeShaper(
				storedLibrary,
				defaultSchemaPolicy,
				{ shapeFromField: () => fail() },
				minimal.name,
			);
			const buffer = checkNodeEncode(shape, cache, { type: minimal.name });
			assert.deepEqual(buffer, []);
		});

		it("hasOptionalField", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const log: TreeFieldStoredSchema[] = [];
			const shape = treeShaper(
				storedLibrary,
				defaultSchemaPolicy,
				{
					shapeFromField(field: TreeFieldStoredSchema): FieldEncoder {
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
					undefined,
				),
			);
			const bufferEmpty = checkNodeEncode(shape, cache, { type: hasOptionalField.name });
			assert.deepEqual(bufferEmpty, [0]);
			const bufferFull = checkNodeEncode(shape, cache, {
				type: hasOptionalField.name,
				fields: { field: [{ type: leaf.number.name, value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[5]]);
		});

		it("hasExtraField", () => {
			const cache = new EncoderCache(
				() => fail(),
				() => fail(),
				fieldKinds,
			);
			const log: TreeFieldStoredSchema[] = [];
			const shape = treeShaper(
				storedLibrary,
				defaultSchemaPolicy,
				{
					shapeFromField(field: TreeFieldStoredSchema): FieldEncoder {
						log.push(field);
						return cache.nestedArray(numericShape);
					},
				},
				numericMap.name,
			);
			assert.deepEqual(
				shape,
				new NodeShape(numericMap.name, false, [], cache.nestedArray(numericShape)),
			);
			const bufferEmpty = checkNodeEncode(shape, cache, { type: numericMap.name });
			assert.deepEqual(bufferEmpty, [[]]);
			const bufferFull = checkNodeEncode(shape, cache, {
				type: numericMap.name,
				fields: { extra: [{ type: leaf.number.name, value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[new IdentifierToken("extra"), [5]]]);
		});
	});

	it("recursiveType", () => {
		const cache = buildCache(storedLibrary, defaultSchemaPolicy);
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
		useSnapshotDirectory("chunked-forest-schema-compressed");
		// TODO: test non size 1 batches
		for (const { name, treeFactory, schemaData } of testTrees) {
			it(name, () => {
				const storedSchema = intoStoredSchema(schemaData);
				const tree = treeFactory();
				// Check with checkFieldEncode
				const cache = buildCache(storedSchema, defaultSchemaPolicy);
				checkFieldEncode(anyFieldEncoder, cache, tree);

				const context: FieldBatchEncodingContext = {
					encodeType: TreeCompressionStrategy.Compressed,
					schema: { schema: storedSchema, policy: defaultSchemaPolicy },
				};
				const codec = makeFieldBatchCodec({ jsonValidator: ajvValidator });
				// End to end test
				const encoded = codec.encode([cursorForJsonableTreeField(tree)], context);
				const result = codec.decode(encoded, context);
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
				takeSnapshot(dataStr, `.json`);
			});
		}
	});
});
