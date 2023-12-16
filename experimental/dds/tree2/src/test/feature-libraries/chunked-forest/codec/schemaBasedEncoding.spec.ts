/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { TreeFieldStoredSchema, TreeNodeSchemaIdentifier } from "../../../../core";
import {
	defaultSchemaPolicy,
	cursorForJsonableTreeField,
	intoStoredSchema,
	TreeCompressionStrategy,
} from "../../../../feature-libraries";

import {
	buildCache,
	fieldShaper,
	oneFromSet,
	treeShaper,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncoding";
import {
	Context,
	makeFieldBatchCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs";
import {
	AnyShape,
	EncoderCache,
	FieldEncoder,
	NodeEncoder,
	anyFieldEncoder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode";
import { brand } from "../../../../util";
// eslint-disable-next-line import/no-internal-modules
import { NodeShape } from "../../../../feature-libraries/chunked-forest/codec/nodeShape";
// eslint-disable-next-line import/no-internal-modules
import { IdentifierToken } from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric";
import { jsonableTreesFromFieldCursor } from "../fieldCursorTestUtilities";
import {
	hasOptionalField,
	minimal,
	numericMap,
	recursiveType,
	storedLibrary,
	testTrees,
} from "../../../testTrees";
import { typeboxValidator } from "../../../../external-utilities";
import { leaf, SchemaBuilder } from "../../../../domains";
// eslint-disable-next-line import/no-internal-modules
import { fieldKinds } from "../../../../feature-libraries/default-schema";
import { checkFieldEncode, checkNodeEncode } from "./checkEncode";

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
				SchemaBuilder.required(minimal),
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
				SchemaBuilder.required([minimal, leaf.number]),
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
				SchemaBuilder.sequence(minimal),
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
		// TODO: test non size 1 batches
		for (const { name, treeFactory, schemaData } of testTrees) {
			it(name, () => {
				const storedSchema = intoStoredSchema(schemaData);
				const tree = treeFactory();
				// Check with checkFieldEncode
				const cache = buildCache(storedSchema, defaultSchemaPolicy);
				checkFieldEncode(anyFieldEncoder, cache, tree);

				const context: Context = {
					encodeType: TreeCompressionStrategy.Compressed,
					schema: { schema: storedSchema, policy: defaultSchemaPolicy },
				};
				const codec = makeFieldBatchCodec({ jsonValidator: typeboxValidator })(context);
				// End to end test
				const encoded = codec.encode([cursorForJsonableTreeField(tree)]);
				const result = codec.decode(encoded);
				const resultTree = result.map(jsonableTreesFromFieldCursor);
				assert.deepEqual(resultTree, [tree]);
			});
		}
	});
});
