/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	createIdCompressor,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { currentVersion } from "../../../../codec/index.js";
import type {
	FieldKey,
	ITreeCursorSynchronous,
	JsonableTree,
	TreeChunk,
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
} from "../../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { decode } from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
// eslint-disable-next-line import-x/no-internal-modules
import { IdentifierToken } from "../../../../feature-libraries/chunked-forest/codec/chunkEncodingGeneric.js";
import {
	type FieldBatchEncodingContext,
	fieldBatchCodecBuilder,
	type ChunkReferenceId,
	type IncrementalEncoder,
	type IncrementalDecoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
import {
	AnyShape,
	EncoderContext,
	type FieldEncoder,
	type NodeEncoder,
	anyFieldEncoder,
	incrementalFieldEncoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
import {
	FieldBatchFormatVersion,
	type EncodedFieldBatchV2,
	type EncodedFieldBatchVTextExperimental,
	SpecialField,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format/index.js";
import {
	NodeShapeBasedEncoder,
	SpecializedNodeShapeEncoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/nodeEncoder.js";
import {
	buildContext,
	getFieldEncoder,
	getNodeEncoder,
	schemaCompressedEncodeVTextExperimentalForTests,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncode.js";
// eslint-disable-next-line import-x/no-internal-modules
import { FieldKinds, fieldKinds } from "../../../../feature-libraries/default-schema/index.js";
import {
	TreeCompressionStrategy,
	chunkFieldSingle,
	cursorForJsonableTreeField,
	defaultChunkPolicy,
	defaultSchemaPolicy,
	emptyChunk,
	jsonableTreeFromFieldCursor,
} from "../../../../feature-libraries/index.js";
import {
	booleanSchema,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	numberSchema,
	SchemaFactoryAlpha,
	stringSchema,
	TreeViewConfigurationAlpha,
	type UnsafeUnknownSchema,
} from "../../../../simple-tree/index.js";
import {
	toStoredSchema,
	restrictiveStoredSchemaGenerationOptions,
	toInitialSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../simple-tree/toStoredSchema.js";
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
import {
	assertIsSessionId,
	fieldCursorFromInsertable,
	testIdCompressor,
} from "../../../utils.js";

import { checkFieldEncode, checkNodeEncode } from "./checkEncode.js";

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

const fieldBatchVersion = brand<FieldBatchFormatVersion>(FieldBatchFormatVersion.v1);

describe("schemaBasedEncoding", () => {
	describe("getFieldEncoder", () => {
		it("monomorphic-value", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const log: string[] = [];
			const fieldEncoder = getFieldEncoder(
				{
					nodeEncoderFromSchema(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				toInitialSchema(Minimal).rootFieldSchema,
				context,
				{ nodeSchema: new Map() },
			);
			// This is expected since this case should be optimized to just encode the inner shape.
			assert.equal(fieldEncoder.shape, onlyTypeShape);
			const buffer = checkFieldEncode(fieldEncoder, context, [
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
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const log: string[] = [];
			const fieldEncoder = getFieldEncoder(
				{
					nodeEncoderFromSchema(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return onlyTypeShape;
					},
				},
				toInitialSchema([Minimal, numberSchema]).rootFieldSchema,
				context,
				{ nodeSchema: new Map() },
			);
			// There are multiple choices about how this case should be optimized, but the current implementation does this:
			assert.equal(fieldEncoder.shape, AnyShape.instance);
			checkFieldEncode(fieldEncoder, context, [{ type: brand(Minimal.identifier) }]);
			checkFieldEncode(fieldEncoder, context, [{ type: brand("numeric"), value: 1 }]);
		});

		it("sequence", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const log: string[] = [];
			const fieldEncoder = getFieldEncoder(
				{
					nodeEncoderFromSchema(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
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
			assert.equal(fieldEncoder.shape, context.nestedArrayEncoder(onlyTypeShape).shape);
			assert.deepEqual(checkFieldEncode(fieldEncoder, context, []), [0]);
			assert.deepEqual(
				checkFieldEncode(fieldEncoder, context, [{ type: brand(Minimal.identifier) }]),
				[[new IdentifierToken("test.minimal")]],
			);
			assert.deepEqual(
				checkFieldEncode(fieldEncoder, context, [
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
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const log: string[] = [];

			const storedSchema = toStoredSchema(
				SchemaFactoryAlpha.identifier(),
				restrictiveStoredSchemaGenerationOptions,
			);

			const fieldEncoder = getFieldEncoder(
				{
					nodeEncoderFromSchema(schemaName: TreeNodeSchemaIdentifier): NodeEncoder {
						log.push(schemaName);
						return identifierShape;
					},
				},
				storedSchema.rootFieldSchema,
				context,
				storedSchema,
			);
			const compressedId = testIdCompressor.generateCompressedId();
			const stableId = testIdCompressor.decompress(compressedId);
			assert.deepEqual(fieldEncoder.shape, identifierShape);
			assert.deepEqual(
				checkFieldEncode(fieldEncoder, context, [
					{ type: brand(stringSchema.identifier), value: stableId },
				]),
				[compressedId],
			);
		});
	});

	describe("getNodeEncoder", () => {
		it("minimal", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const nodeEncoder = getNodeEncoder(
				{ fieldEncoderFromSchema: () => fail() },
				toInitialSchema(Minimal),
				brand(Minimal.identifier),
			);
			const buffer = checkNodeEncode(nodeEncoder, context, {
				type: brand(Minimal.identifier),
			});
			assert.deepEqual(buffer, []);
		});

		it("hasOptionalField", () => {
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const log: TreeFieldStoredSchema[] = [];
			const nodeEncoder = getNodeEncoder(
				{
					fieldEncoderFromSchema(field: TreeFieldStoredSchema): FieldEncoder {
						log.push(field);
						return context.nestedArrayEncoder(numericShape);
					},
				},
				toInitialSchema(HasOptionalField),
				brand(HasOptionalField.identifier),
			);
			assert.deepEqual(
				nodeEncoder,
				new NodeShapeBasedEncoder(
					brand(HasOptionalField.identifier),
					false,
					[{ key: brand("field"), encoder: context.nestedArrayEncoder(numericShape) }],
					undefined,
				),
			);
			const bufferEmpty = checkNodeEncode(nodeEncoder, context, {
				type: brand(HasOptionalField.identifier),
			});
			assert.deepEqual(bufferEmpty, [0]);
			const bufferFull = checkNodeEncode(nodeEncoder, context, {
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
				undefined /* incrementalEncoder */,
				fieldBatchVersion,
				false /* isSummary */,
			);
			const log: TreeFieldStoredSchema[] = [];
			const nodeEncoder = getNodeEncoder(
				{
					fieldEncoderFromSchema(field: TreeFieldStoredSchema): FieldEncoder {
						log.push(field);
						return context.nestedArrayEncoder(numericShape);
					},
				},
				toInitialSchema(NumericMap),
				brand(NumericMap.identifier),
			);
			assert.deepEqual(
				nodeEncoder,
				new NodeShapeBasedEncoder(
					brand(NumericMap.identifier),
					false,
					[],
					context.nestedArrayEncoder(numericShape),
				),
			);
			const bufferEmpty = checkNodeEncode(nodeEncoder, context, {
				type: brand(NumericMap.identifier),
			});
			assert.deepEqual(bufferEmpty, [[]]);
			const bufferFull = checkNodeEncode(nodeEncoder, context, {
				type: brand(NumericMap.identifier),
				fields: { extra: [{ type: brand(numberSchema.identifier), value: 5 }] },
			});
			assert.deepEqual(bufferFull, [[new IdentifierToken("extra"), [5]]]);
		});

		it("incrementalEncoder", () => {
			const sf = new SchemaFactoryAlpha("test");
			class HasOptionalFields extends sf.object("hasOptionalField", {
				field: sf.optional(sf.number),
				incrementalField: sf.optional(
					sf.types([{ type: sf.number, metadata: {} }], {
						custom: { [incrementalSummaryHint]: true },
					}),
				),
			}) {}
			const testReferenceId: ChunkReferenceId = brand(123);
			const mockIncrementalEncoder: IncrementalEncoder = {
				shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: HasOptionalFields }),
				),
				encodeIncrementalField: (
					cursor: ITreeCursorSynchronous,
					chunkEncoder: (chunk: TreeChunk) => EncodedFieldBatchV2,
				): ChunkReferenceId[] => {
					const fieldKey = cursor.getFieldKey();
					assert(fieldKey === "incrementalField", "should only encode incremental fields");
					return [testReferenceId]; // Return mock reference IDs
				},
			};
			const mockIncrementalDecoder: IncrementalDecoder = {
				decodeIncrementalChunk: (referenceId, chunkDecoder) => {
					assert(referenceId === testReferenceId);
					return emptyChunk;
				},
			};

			// Create context with the mock incremental encoder
			const context = new EncoderContext(
				() => fail(),
				() => fail(),
				fieldKinds,
				testIdCompressor,
				mockIncrementalEncoder,
				brand(FieldBatchFormatVersion.v2), // Use v2 or higher for incremental encoding support
				false /* isSummary */,
			);

			const log: TreeFieldStoredSchema[] = [];
			const nodeEncoder = getNodeEncoder(
				{
					fieldEncoderFromSchema(field: TreeFieldStoredSchema): FieldEncoder {
						log.push(field);
						return context.nestedArrayEncoder(numericShape);
					},
				},
				toInitialSchema(HasOptionalFields),
				brand(HasOptionalFields.identifier),
				mockIncrementalEncoder,
			);

			const expectedNodeEncoder = new NodeShapeBasedEncoder(
				brand(HasOptionalFields.identifier),
				false,
				[
					{ key: brand("field"), encoder: context.nestedArrayEncoder(numericShape) },
					{ key: brand("incrementalField"), encoder: incrementalFieldEncoder },
				],
				undefined,
			);

			// Verify that the node encoder is created with incremental field encoder for the "extra" field
			assert.deepEqual(nodeEncoder, expectedNodeEncoder);

			const buffer = checkNodeEncode(
				nodeEncoder,
				context,
				{
					type: brand(HasOptionalFields.identifier),
				},
				mockIncrementalDecoder,
			);
			assert.deepEqual(buffer, [0, [testReferenceId]]);
		});
	});

	it("recursiveType", () => {
		const context = buildContext(
			toInitialSchema(RecursiveType),
			defaultSchemaPolicy,
			testIdCompressor,
			undefined /* incrementalEncoder */,
			fieldBatchVersion,
			false /* isSummary */,
		);
		const nodeEncoder = context.nodeEncoderFromSchema(brand(RecursiveType.identifier));
		const bufferEmpty = checkNodeEncode(nodeEncoder, context, {
			type: brand(RecursiveType.identifier),
		});
		assert.deepEqual(bufferEmpty, [0]);
		const bufferFull = checkNodeEncode(nodeEncoder, context, {
			type: brand(RecursiveType.identifier),
			fields: { field: [{ type: brand(RecursiveType.identifier) }] },
		});
		assert.deepEqual(bufferFull, [[0]]);
	});

	describe("schemaCompressedEncodeVTextExperimental", () => {
		// Setup used in multiple tests below, so defined in the outer scope of the describe block.
		const countSpecializedShapes = (
			batch: EncodedFieldBatchV2 | EncodedFieldBatchVTextExperimental,
		): number => batch.shapes.filter((shape) => "f" in shape).length;

		const decodeRoundTrip = (
			encoded: EncodedFieldBatchV2 | EncodedFieldBatchVTextExperimental,
		): ReturnType<typeof decode> => {
			const decoded = decode(encoded as unknown as Parameters<typeof decode>[0], {
				idCompressor: testIdCompressor,
				originatorId: testIdCompressor.localSessionId,
				isSummary: false,
			});
			assert.equal(decoded.length, 1);
			return decoded;
		};

		const makeChunkingIncrementalEncoder = (
			shouldEncodeIncrementally: IncrementalEncoder["shouldEncodeIncrementally"],
			onEncode: (encodedSubBatch: EncodedFieldBatchV2) => void,
		): IncrementalEncoder => {
			let nextRefId = 1;
			return {
				shouldEncodeIncrementally,
				encodeIncrementalField: (cursor, chunkEncoder) => {
					const chunk = chunkFieldSingle(cursor, {
						idCompressor: testIdCompressor,
						policy: defaultChunkPolicy,
					});
					try {
						onEncode(chunkEncoder(chunk));
					} finally {
						chunk.referenceRemoved();
					}
					return [brand<ChunkReferenceId>(nextRefId++)];
				},
			};
		};

		it("round-trips an object with boolean fields and emits f shapes", () => {
			const sf = new SchemaFactoryAlpha("test");
			class CharacterFormat extends sf.object("CharacterFormat", {
				bold: sf.boolean,
				italic: sf.boolean,
			}) {}

			const storedSchema = toStoredSchema(
				CharacterFormat,
				restrictiveStoredSchemaGenerationOptions,
			);

			const makeFormat = (bold: boolean, italic: boolean): JsonableTree => ({
				type: brand<TreeNodeSchemaIdentifier>(CharacterFormat.identifier),
				fields: {
					bold: [
						{ type: brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier), value: bold },
					],
					italic: [
						{ type: brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier), value: italic },
					],
				},
			});

			// Use a small specialization threshold so the test stays compact while still exercising the heuristic
			//   {bold:true, italic:false}  — appears 2 times (≥ threshold) → should specialize.
			//   {bold:false, italic:true}  — appears 1 time  (<  threshold) → should not.
			const minOccurrencesForSpecialization = 2;
			const aboveThreshold = Array.from({ length: 2 }, () => makeFormat(true, false));
			const belowThreshold = [makeFormat(false, true)];
			const tree = [...aboveThreshold, ...belowThreshold];

			const encoded = schemaCompressedEncodeVTextExperimentalForTests(
				storedSchema,
				defaultSchemaPolicy,
				[cursorForJsonableTreeField(tree)],
				testIdCompressor,
				undefined,
				false,
				minOccurrencesForSpecialization,
			);

			// Exactly one specialized shape: only the above-threshold tuple is folded.
			assert.equal(countSpecializedShapes(encoded), 1);

			// Round-trip: decode and compare to original tree.
			const decoded = decodeRoundTrip(encoded);
			const firstChunk = decoded[0] ?? assert.fail("expected at least one decoded chunk");
			const resultTree = jsonableTreeFromFieldCursor(firstChunk.cursor());
			assert.deepEqual(resultTree, tree);
		});

		it("incremental: outer count skips incremental fields, sub-chunks make their own decisions", () => {
			// Schema:
			//   CharacterFormat — VText specialization candidate (two required boolean leaves).
			//   Doc             — has an inline CharacterArray field and an incremental one
			//                     (marked with incrementalSummaryHint on its allowed types).
			const sf = new SchemaFactoryAlpha("test");
			class CharacterFormat extends sf.object("CharacterFormat", {
				bold: sf.boolean,
				italic: sf.boolean,
			}) {}
			class CharacterArray extends sf.array("CharacterArray", CharacterFormat) {}
			class Doc extends sf.object("Doc", {
				inline: sf.optional(CharacterArray),
				inc: sf.optional(
					sf.types([{ type: CharacterArray, metadata: {} }], {
						custom: { [incrementalSummaryHint]: true },
					}),
				),
			}) {}

			const storedSchema = toStoredSchema(Doc, restrictiveStoredSchemaGenerationOptions);

			// Use a lowered threshold of 2 so the test stays compact.
			//   Outer inline:  2 × (true, false)  ≥ threshold → should specialize.
			//   Outer inline:  1 × (false, true)   < threshold → should NOT specialize.
			//   Sub-chunk:     1 × (false, true)   < threshold → should NOT specialize.
			// If the outer counted sub-chunk nodes, (false, true) would reach 2 → 2 specialized
			// shapes instead of 1. The assertion below catches that.
			const minOccurrencesForSpecialization = 2;
			const inline = [
				...Array.from({ length: 2 }, () => new CharacterFormat({ bold: true, italic: false })),
				new CharacterFormat({ bold: false, italic: true }),
			];
			const inc = new CharacterArray([new CharacterFormat({ bold: false, italic: true })]);
			const doc = new Doc({ inline: new CharacterArray(inline), inc });

			const subEncodings: EncodedFieldBatchV2[] = [];
			const mockIncEncoder = makeChunkingIncrementalEncoder(
				incrementalEncodingPolicyForAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: Doc }),
				),
				(encodedSubBatch) => subEncodings.push(encodedSubBatch),
			);

			const encoded = schemaCompressedEncodeVTextExperimentalForTests(
				storedSchema,
				defaultSchemaPolicy,
				[fieldCursorFromInsertable<UnsafeUnknownSchema>(Doc, doc)],
				testIdCompressor,
				mockIncEncoder,
				false,
				minOccurrencesForSpecialization,
			);

			assert.equal(countSpecializedShapes(encoded), 1);

			assert.equal(subEncodings.length, 1);
			const subBatch = subEncodings[0] ?? assert.fail("missing sub-chunk encoding");
			assert.equal(countSpecializedShapes(subBatch), 0);
		});

		it("encodes a tree containing a Map node under the Alpha incremental policy without throwing", () => {
			// Regression: pass-1 used to call shouldEncodeIncrementally(parentType, fieldKey)
			// for every field, regardless of parent kind. The Alpha reference policy throws
			// `Field key must not be provided for leaf, map or record node ...` whenever a
			// non-undefined fieldKey reaches a Map/Record/Leaf parent. So encoding any tree
			// containing a Map node would crash during the count pass before the fix.
			const sf = new SchemaFactoryAlpha("test");
			class CharacterFormat extends sf.object("CharacterFormat", {
				bold: sf.boolean,
				italic: sf.boolean,
			}) {}
			class FormatMap extends sf.map("FormatMap", CharacterFormat) {}
			class Doc extends sf.object("Doc", {
				map: FormatMap,
			}) {}

			const storedSchema = toStoredSchema(Doc, restrictiveStoredSchemaGenerationOptions);

			// Two CharacterFormat children inside a Map: same boolean tuple, threshold=2 →
			// the count pass must visit both (correctly evaluating the Map parent's policy
			// once with undefined fieldKey) and the encode pass must specialize.
			const minOccurrencesForSpecialization = 2;
			const doc = new Doc({
				map: new FormatMap(
					new Map([
						["a", new CharacterFormat({ bold: true, italic: false })],
						["b", new CharacterFormat({ bold: true, italic: false })],
					]),
				),
			});

			const incEncoder: IncrementalEncoder = {
				shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: Doc }),
				),
				encodeIncrementalField: () =>
					assert.fail("no incremental encoding expected for this schema"),
			};

			const encoded = schemaCompressedEncodeVTextExperimentalForTests(
				storedSchema,
				defaultSchemaPolicy,
				[fieldCursorFromInsertable<UnsafeUnknownSchema>(Doc, doc)],
				testIdCompressor,
				incEncoder,
				false,
				minOccurrencesForSpecialization,
			);

			assert.equal(countSpecializedShapes(encoded), 1);

			// Round-trip to confirm the encoded data is decodable.
			decodeRoundTrip(encoded);
		});

		it("SpecializedNodeShapeEncoder asserts on duplicate keys in fieldOverrides", () => {
			// Regression: the constructor used to silently mishandle duplicates — Map-based
			// merge dropped earlier overrides for base-collisions, and non-base duplicates
			// were appended twice into the merged-fields list. The decoder rejects such
			// shapes at decode time, but the encoder claimed success.
			const base = new NodeShapeBasedEncoder(
				brand<TreeNodeSchemaIdentifier>("Base"),
				false,
				[],
				undefined,
			);
			const leaf = new NodeShapeBasedEncoder(
				brand<TreeNodeSchemaIdentifier>("leaf"),
				true,
				[],
				undefined,
			);
			const dupKey = brand<FieldKey>("k");
			assert.throws(
				() =>
					new SpecializedNodeShapeEncoder(base, [
						{ key: dupKey, encoder: anyFieldEncoder },
						{ key: dupKey, encoder: { encodeField: leaf.encodeNode.bind(leaf), shape: leaf } },
					]),
				validateAssertionError(
					"duplicate field key in SpecializedNodeShapeEncoder fieldOverrides",
				),
			);
		});

		it("specializes two distinct above-threshold tuples into separate shapes", () => {
			const sf = new SchemaFactoryAlpha("test");
			class Format extends sf.object("Format", {
				bold: sf.boolean,
				italic: sf.boolean,
			}) {}

			const storedSchema = toStoredSchema(Format, restrictiveStoredSchemaGenerationOptions);

			const makeFormat = (bold: boolean, italic: boolean): JsonableTree => ({
				type: brand<TreeNodeSchemaIdentifier>(Format.identifier),
				fields: {
					bold: [
						{ type: brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier), value: bold },
					],
					italic: [
						{
							type: brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier),
							value: italic,
						},
					],
				},
			});

			const minOccurrencesForSpecialization = 2;
			const tree = [
				...Array.from({ length: 2 }, () => makeFormat(true, false)),
				...Array.from({ length: 2 }, () => makeFormat(false, true)),
			];

			const encoded = schemaCompressedEncodeVTextExperimentalForTests(
				storedSchema,
				defaultSchemaPolicy,
				[cursorForJsonableTreeField(tree)],
				testIdCompressor,
				undefined,
				false,
				minOccurrencesForSpecialization,
			);

			assert.equal(countSpecializedShapes(encoded), 2);

			const decoded = decodeRoundTrip(encoded);
			const firstChunk = decoded[0] ?? assert.fail("expected at least one decoded chunk");
			assert.deepEqual(jsonableTreeFromFieldCursor(firstChunk.cursor()), tree);
		});

		it("nested subShape specialization exercises multi-iteration counting", () => {
			const sf = new SchemaFactoryAlpha("test");
			class Inner extends sf.object("Inner", {
				flag: sf.boolean,
			}) {}
			class Outer extends sf.object("Outer", {
				child: Inner,
			}) {}

			const storedSchema = toStoredSchema(Outer, restrictiveStoredSchemaGenerationOptions);

			const minOccurrencesForSpecialization = 2;
			const tree: JsonableTree[] = Array.from({ length: 2 }, () => ({
				type: brand<TreeNodeSchemaIdentifier>(Outer.identifier),
				fields: {
					child: [
						{
							type: brand<TreeNodeSchemaIdentifier>(Inner.identifier),
							fields: {
								flag: [
									{
										type: brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier),
										value: true,
									},
								],
							},
						},
					],
				},
			}));

			const encoded = schemaCompressedEncodeVTextExperimentalForTests(
				storedSchema,
				defaultSchemaPolicy,
				[cursorForJsonableTreeField(tree)],
				testIdCompressor,
				undefined,
				false,
				minOccurrencesForSpecialization,
			);

			// Inner's (flag:true) tuple crosses threshold.
			// Outer's (child:Inner-specialized) tuple also crosses threshold.
			// The second specialization requires iteration 2+ of the counting loop,
			// because Outer's specialization key changes once Inner's shape is resolved as specialized.
			assert.equal(
				countSpecializedShapes(encoded),
				2,
				"both Inner and Outer should produce specialized shapes",
			);

			const decoded = decodeRoundTrip(encoded);
			const firstChunk = decoded[0] ?? assert.fail("expected at least one decoded chunk");
			const resultTree = jsonableTreeFromFieldCursor(firstChunk.cursor());
			assert.deepEqual(resultTree, tree);
		});

		it("does not specialize a boolean field that the incremental policy marks as incremental", () => {
			// Regression: getNodeEncoderVText used to include all required boolean leaves in
			// boolFields without consulting the incremental policy. If a policy marked a
			// boolean field as incremental, getNodeEncoder would substitute incrementalFieldEncoder
			// in the base shape, but VText would still pull a constant value out and emit a
			// specialized shape — silently overriding the caller's incremental decision.
			const sf = new SchemaFactoryAlpha("test");
			class Format extends sf.object("Format", {
				bold: sf.boolean,
			}) {}

			const storedSchema = toStoredSchema(Format, restrictiveStoredSchemaGenerationOptions);

			const minOccurrencesForSpecialization = 2;
			const tree = Array.from(
				{ length: 5 },
				(): JsonableTree => ({
					type: brand<TreeNodeSchemaIdentifier>(Format.identifier),
					fields: {
						bold: [
							{
								type: brand<TreeNodeSchemaIdentifier>(booleanSchema.identifier),
								value: true,
							},
						],
					},
				}),
			);

			// Custom policy that marks Format.bold as incremental. The policy returns false
			// for the root field (parent undefined) and for any other call.
			const customPolicy = (nodeId: string | undefined, fieldKey?: string): boolean =>
				nodeId === Format.identifier && fieldKey === "bold";

			let chunkEncoderCalls = 0;
			const incEncoder = makeChunkingIncrementalEncoder(customPolicy, () => {
				chunkEncoderCalls += 1;
			});

			const encoded = schemaCompressedEncodeVTextExperimentalForTests(
				storedSchema,
				defaultSchemaPolicy,
				[cursorForJsonableTreeField(tree)],
				testIdCompressor,
				incEncoder,
				false,
				minOccurrencesForSpecialization,
			);

			// Without the fix, the bold field would have been folded into a specialized shape
			// (count=5 >= threshold=2), producing 1 specialized shape and 0 incremental calls.
			assert.equal(countSpecializedShapes(encoded), 0);
			assert.ok(chunkEncoderCalls > 0);
		});
	});

	for (const version of fieldBatchCodecBuilder.registry.map((entry) => entry.formatVersion)) {
		describe(`test trees FieldBatchFormatVersion V${version}`, () => {
			useSnapshotDirectory(`chunked-forest-schema-compressed/V${version}`);
			// TODO: test non size 1 batches
			for (const { name, treeFactory, schemaData } of testTrees) {
				it(name, () => {
					const idCompressor = createIdCompressor(
						assertIsSessionId("00000000-0000-4000-b000-000000000000"),
					);
					const storedSchema = schemaData;
					const tree = treeFactory(idCompressor);
					// Check with checkFieldEncode
					const context = buildContext(
						storedSchema,
						defaultSchemaPolicy,
						idCompressor,
						undefined /* incrementalEncoder */,
						brand(version),
						false /* isSummary */,
					);
					checkFieldEncode(anyFieldEncoder, context, tree, idCompressor);

					const fieldBatchContext: FieldBatchEncodingContext = {
						encodeType: TreeCompressionStrategy.Compressed,
						originatorId: testIdCompressor.localSessionId,
						isSummary: false,
						schema: { schema: storedSchema, policy: defaultSchemaPolicy },
						idCompressor,
					};
					const idCompressorCore = toIdCompressorWithCore(idCompressor);
					idCompressorCore.finalizeCreationRange(idCompressorCore.takeNextCreationRange());
					const codec = fieldBatchCodecBuilder.build({
						jsonValidator: ajvValidator,
						minVersionForCollab: currentVersion,
						...(version === FieldBatchFormatVersion.vTextExperimental
							? {
									writeVersionOverrides: new Map([
										[fieldBatchCodecBuilder.name, FieldBatchFormatVersion.vTextExperimental],
									]),
									allowPossiblyIncompatibleWriteVersionOverrides: true,
								}
							: {}),
					});
					// End to end test
					// rootFieldSchema is not being used in encoding, so we currently have some limitations. Schema based optimizations for root case don't trigger.
					const encoded = codec.encode([cursorForJsonableTreeField(tree)], fieldBatchContext);
					const result = codec.decode(encoded, fieldBatchContext);
					const resultTree = result.map(jsonableTreeFromFieldCursor);
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
	}
});
