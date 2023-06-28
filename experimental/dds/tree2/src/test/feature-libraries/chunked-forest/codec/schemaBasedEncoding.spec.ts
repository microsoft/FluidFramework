/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { FieldStoredSchema, TreeSchemaIdentifier } from "../../../../core";
import { SchemaBuilder } from "../../../../feature-libraries";

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
import {
	hasExtraLocalFields,
	hasOptionalField,
	library,
	minimal,
	numeric,
	recursiveType,
	testTrees,
} from "./testTrees";

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
