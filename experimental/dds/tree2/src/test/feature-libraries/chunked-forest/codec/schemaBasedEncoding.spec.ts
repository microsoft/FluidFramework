/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { FieldStoredSchema, TreeSchemaIdentifier } from "../../../../core";
import { SchemaBuilder, defaultSchemaPolicy } from "../../../../feature-libraries";

import {
	buildCache,
	fieldShaper,
	oneFromSet,
	treeShaper,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncoding";
import {
	makeSchemaCompressedCodec,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedCodecs";
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
import {
	fieldCursorFromJsonableTrees,
	jsonableTreesFromFieldCursor,
} from "../fieldCursorTestUtilities";
import {
	hasOptionalField,
	library,
	minimal,
	numeric,
	numericMap,
	recursiveType,
	testTrees,
} from "../../../testTrees";
import { typeboxValidator } from "../../../../external-utilities";
import { checkFieldEncode, checkNodeEncode } from "./checkEncode";

const anyNodeShape = new NodeShape(undefined, undefined, [], anyFieldEncoder);
const onlyTypeShape = new NodeShape(undefined, false, [], undefined);
const numericShape = new NodeShape(numeric.name, true, [], undefined);

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
					shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoder {
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
					shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoder {
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
					shapeFromTree(schemaName: TreeSchemaIdentifier): NodeEncoder {
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
			const shape = treeShaper(
				library,
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
			);
			const log: FieldStoredSchema[] = [];
			const shape = treeShaper(
				library,
				defaultSchemaPolicy,
				{
					shapeFromField(field: FieldStoredSchema): FieldEncoder {
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
				defaultSchemaPolicy,
				{
					shapeFromField(field: FieldStoredSchema): FieldEncoder {
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
				fields: { extra: [{ type: numeric.name, value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[new IdentifierToken("extra"), [5]]]);
		});
	});

	it("recursiveType", () => {
		const cache = buildCache(library, defaultSchemaPolicy);
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
		for (const { name, treeFactory, schemaData } of testTrees) {
			it(name, () => {
				const tree = treeFactory();
				// Check with checkFieldEncode
				const cache = buildCache(schemaData, defaultSchemaPolicy);
				checkFieldEncode(anyFieldEncoder, cache, tree);

				const codec = makeSchemaCompressedCodec(
					{ jsonValidator: typeboxValidator },
					schemaData,
					defaultSchemaPolicy,
				);
				// End to end test
				const encoded = codec.encode(fieldCursorFromJsonableTrees(tree));
				const result = codec.decode(encoded);
				const resultTree = jsonableTreesFromFieldCursor(result);
				assert.deepEqual(resultTree, tree);
				assert.equal(resultTree.length, tree.length);
			});
		}
	});
});
