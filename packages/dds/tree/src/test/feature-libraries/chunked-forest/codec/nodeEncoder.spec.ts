/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import type { JsonableTree } from "../../../../core/index.js";
import {
	Counter,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkCodecUtilities.js";
import {
	IdentifierToken,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";
import {
	EncoderContext,
	type FieldEncoder,
	asFieldEncoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
// eslint-disable-next-line import-x/no-internal-modules
import { NodeShapeBasedEncoder } from "../../../../feature-libraries/chunked-forest/codec/nodeEncoder.js";
// eslint-disable-next-line import-x/no-internal-modules
import { fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import { FieldBatchFormatVersion } from "../../../../feature-libraries/index.js";
import { brand } from "../../../../util/index.js";
import { assertIsSessionId, testIdCompressor } from "../../../utils.js";

import { checkNodeEncode } from "./checkEncode.js";

const fieldBatchVersion = brand<FieldBatchFormatVersion>(FieldBatchFormatVersion.v1);

describe("nodeShape", () => {
	describe("NodeShapeBasedEncoder", () => {
		it("empty node", () => {
			const shape = new NodeShapeBasedEncoder(undefined, false, [], undefined);
			const identifierCounter = new Counter<string>();
			shape.countReferencedShapesAndIdentifiers(identifierCounter, () => fail());
			assert(identifierCounter.buildTable().indexToValue.length === 0);

			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
			);

			const buffer = checkNodeEncode(shape, context, {
				type: brand("foo"),
			});
			assert.deepEqual(buffer, [new IdentifierToken("foo")]);
		});

		it("typed node with value", () => {
			const shape = new NodeShapeBasedEncoder(brand("foo"), true, [], undefined);

			const identifierCounter = new Counter<string>();
			shape.countReferencedShapesAndIdentifiers(identifierCounter, () => fail());
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
			);

			const encodedChunk = checkNodeEncode(shape, context, {
				type: brand("foo"),
				value: 5,
			});
			assert.deepEqual(encodedChunk, [5]);
		});

		it("dynamic", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
			);

			const fieldShapeLocal = context.nestedArrayEncoder(
				new NodeShapeBasedEncoder(undefined, false, [], undefined),
			);
			const shape = new NodeShapeBasedEncoder(undefined, undefined, [], fieldShapeLocal);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					a: [{ type: brand("l1") }],
					b: [{ type: brand("l2") }, { type: brand("l3") }],
				},
			};

			const encodedChunk = checkNodeEncode(shape, context, tree);
			assert.deepEqual(encodedChunk, [
				new IdentifierToken("type"),
				true,
				"value",
				[
					new IdentifierToken("a"),
					[new IdentifierToken("l1")],
					new IdentifierToken("b"),
					[new IdentifierToken("l2"), new IdentifierToken("l3")],
				],
			]);
		});

		it("fixed fields", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
			);

			// Shape which encodes to nothing.
			const fieldEncoder1: FieldEncoder = asFieldEncoder(
				new NodeShapeBasedEncoder(brand("1"), false, [], undefined),
			);
			// Shape which encodes to just the value.
			const shapeValueOnly = new NodeShapeBasedEncoder(brand("2"), true, [], undefined);

			// Shape which encodes to nested array of values.
			const shapeValues = context.nestedArrayEncoder(shapeValueOnly);

			// Shape which encodes to nested array of values.
			const shape = new NodeShapeBasedEncoder(
				brand("type"),
				true,
				[
					{ key: brand("nothing"), encoder: fieldEncoder1 },
					{ key: brand("shapeValueOnly"), encoder: asFieldEncoder(shapeValueOnly) },
					{ key: brand("shapeValues"), encoder: shapeValues },
				],
				undefined,
			);

			const tree: JsonableTree = {
				type: brand("type"),
				value: "value",
				fields: {
					nothing: [{ type: brand("1") }],
					shapeValueOnly: [{ type: brand("2"), value: "v" }],
					shapeValues: [{ type: brand("2"), value: 6 }],
				},
			};

			const encodedChunk = checkNodeEncode(shape, context, tree);
			assert.deepEqual(encodedChunk, ["value", "v", [6]]);
		});

		// Repro for the attach-summary ID bug: an identifier value generated locally by a session
		// that hasn't yet been allocated a cluster will normalize to a negative op-space ID. If we
		// emit that into an attach summary blob that is later reused as a handle, no client that
		// loads the persisted IdCompressor state (which excludes session-local data) can resolve
		// the ID. With `idsMustBeFinalized: true`, the encoder must instead emit the stable UUID.
		describe("idsMustBeFinalized for SpecialField.Identifier", () => {
			function makeIdentifierShape(): NodeShapeBasedEncoder {
				return new NodeShapeBasedEncoder(brand("id"), 0 /* SpecialField.Identifier */, [], undefined);
			}

			it("emits negative op-space IDs when the flag is false (default)", () => {
				const compressor = createIdCompressor(
					assertIsSessionId("00000000-0000-4000-8000-000000000001"),
				);
				const localId = compressor.generateCompressedId();
				assert(localId < 0, "test setup requires a non-finalized (negative) ID");
				const stableId = compressor.decompress(localId);

				const context = new EncoderContext(
					() => fail(),
					() => fail(),
					fieldKinds,
					compressor,
					undefined /* incrementalEncoder */,
					fieldBatchVersion,
				);

				const encoded = checkNodeEncode(makeIdentifierShape(), context, {
					type: brand("id"),
					value: stableId,
				});
				assert.deepEqual(
					encoded,
					[compressor.normalizeToOpSpace(localId)],
					"default behavior must preserve the existing on-wire form",
				);
			});

			it("falls back to the stable UUID when the flag is true and the ID is not finalized", () => {
				const compressor = createIdCompressor(
					assertIsSessionId("00000000-0000-4000-8000-000000000002"),
				);
				const localId = compressor.generateCompressedId();
				assert(localId < 0, "test setup requires a non-finalized (negative) ID");
				const stableId = compressor.decompress(localId);

				const context = new EncoderContext(
					() => fail(),
					() => fail(),
					fieldKinds,
					compressor,
					undefined /* incrementalEncoder */,
					fieldBatchVersion,
					true /* idsMustBeFinalized */,
				);

				const encoded = checkNodeEncode(makeIdentifierShape(), context, {
					type: brand("id"),
					value: stableId,
				});
				assert.deepEqual(
					encoded,
					[stableId],
					"non-finalized IDs must be emitted as their stable UUID",
				);
			});

			it("still emits the final op-space ID when the flag is true and the ID is finalized", () => {
				// testIdCompressor uses a permanent ghost session so every generated ID is final.
				const finalId = testIdCompressor.generateCompressedId();
				assert(finalId >= 0, "test setup requires an already-finalized ID");
				const stableId = testIdCompressor.decompress(finalId);

				const context = new EncoderContext(
					() => fail(),
					() => fail(),
					fieldKinds,
					testIdCompressor,
					undefined /* incrementalEncoder */,
					fieldBatchVersion,
					true /* idsMustBeFinalized */,
				);

				const encoded = checkNodeEncode(makeIdentifierShape(), context, {
					type: brand("id"),
					value: stableId,
				});
				assert.deepEqual(
					encoded,
					[testIdCompressor.normalizeToOpSpace(finalId)],
					"finalized IDs must still be emitted as op-space numbers",
				);
			});
		});
	});
});
