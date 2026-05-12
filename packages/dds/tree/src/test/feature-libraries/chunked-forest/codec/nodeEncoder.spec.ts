/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	createIdCompressor,
	createSessionId,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";

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
import {
	SpecialField,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { NodeShapeBasedEncoder } from "../../../../feature-libraries/chunked-forest/codec/nodeEncoder.js";
// eslint-disable-next-line import-x/no-internal-modules
import { fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import { FieldBatchFormatVersion } from "../../../../feature-libraries/index.js";
import { brand } from "../../../../util/index.js";
import { testIdCompressor } from "../../../utils.js";

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
				false /* isSummary */,
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
				false /* isSummary */,
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
				false /* isSummary */,
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
				false /* isSummary */,
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

		describe("Node with identifier", () => {
			function makeIdentifierShape(): NodeShapeBasedEncoder {
				return new NodeShapeBasedEncoder(brand("id"), SpecialField.Identifier, [], undefined);
			}

			function makeContext(idCompressor: IIdCompressor, isSummary: boolean): EncoderContext {
				return new EncoderContext(
					() => fail(),
					() => fail(),
					fieldKinds,
					idCompressor,
					undefined /* incrementalEncoder */,
					fieldBatchVersion,
					isSummary,
				);
			}

			it("emits the negative op-space id for a non-finalized id when isSummary=false", () => {
				const idCompressor = createIdCompressor(createSessionId());
				const sessionSpaceId = idCompressor.generateCompressedId();
				const stableUuid = idCompressor.decompress(sessionSpaceId);
				assert(
					idCompressor.normalizeToOpSpace(sessionSpaceId) < 0,
					"freshly generated id should be in local (negative) op-space",
				);
				const buffer = checkNodeEncode(
					makeIdentifierShape(),
					makeContext(idCompressor, false),
					{ type: brand("id"), value: stableUuid },
				);
				assert.equal(buffer.length, 1);
				assert.equal(typeof buffer[0], "number");
				assert((buffer[0] as number) < 0);
			});

			// Unlike ops, summaries do not inherently have the context of who originated a negative ID.
			// Attaching a SharedTree to an already attached container can encode a forest containing identifiers
			// that are not yet finalized. In such cases, the encoder should either emit the stable UUID or otherwise
			// guarantee the correct originator ID is part of the summary. This test enforces the former behavior;
			// if the latter is implemented it would be reasonable to rework it.
			it("emits the stable UUID for a non-finalized id when isSummary=true", () => {
				const idCompressor = createIdCompressor(createSessionId());
				const sessionSpaceId = idCompressor.generateCompressedId();
				const stableUuid = idCompressor.decompress(sessionSpaceId);
				assert(
					idCompressor.normalizeToOpSpace(sessionSpaceId) < 0,
					"freshly generated id should be in local (negative) op-space",
				);
				const buffer = checkNodeEncode(
					makeIdentifierShape(),
					makeContext(idCompressor, true),
					{ type: brand("id"), value: stableUuid },
				);
				assert.deepEqual(buffer, [stableUuid]);
			});

			it("still emits the op-space integer for a finalized id when isSummary=true", () => {
				const idCompressor = createIdCompressor(createSessionId());
				const sessionSpaceId = idCompressor.generateCompressedId();
				const stableUuid = idCompressor.decompress(sessionSpaceId);
				// Round-trip the creation range so the id has a cluster allocated.
				const core = toIdCompressorWithCore(idCompressor);
				core.finalizeCreationRange(core.takeNextCreationRange());
				const opSpaceId = idCompressor.normalizeToOpSpace(sessionSpaceId);
				assert(
					opSpaceId >= 0,
					"after finalization the id should be in finalized (non-negative) op-space",
				);
				const buffer = checkNodeEncode(
					makeIdentifierShape(),
					makeContext(idCompressor, true),
					{ type: brand("id"), value: stableUuid },
				);
				assert.deepEqual(buffer, [opSpaceId]);
			});

			it("emits the original string for an unknown stable UUID regardless of isSummary", () => {
				// A stable UUID minted in a different id-compressor — `idCompressor`
				// cannot recompress it, so the encoder falls through to the
				// pass-through path that emits the original string.
				const otherCompressor = createIdCompressor(createSessionId());
				const unknownUuid = otherCompressor.decompress(otherCompressor.generateCompressedId());
				for (const isSummary of [false, true]) {
					const buffer = checkNodeEncode(
						makeIdentifierShape(),
						makeContext(testIdCompressor, isSummary),
						{ type: brand("id"), value: unknownUuid },
					);
					assert.deepEqual(buffer, [unknownUuid], `isSummary=${isSummary}`);
				}
			});
		});
	});
});
