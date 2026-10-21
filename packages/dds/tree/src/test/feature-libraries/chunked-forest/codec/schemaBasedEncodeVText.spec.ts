/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { currentVersion } from "../../../../codec/index.js";
import type {
	FieldKey,
	JsonableTree,
	TreeNodeSchemaIdentifier,
} from "../../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { decode } from "../../../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
import type {
	ChunkReferenceId,
	IncrementalDecoder,
	IncrementalEncoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/codecs.js";
// eslint-disable-next-line import-x/no-internal-modules
import { asFieldEncoder } from "../../../../feature-libraries/chunked-forest/codec/compressedEncode.js";
import {
	FieldBatchFormatVersion,
	type EncodedFieldBatchAnyVersion,
	type EncodedFieldBatchVTextExperimental,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format/index.js";
import {
	NodeShapeBasedEncoder,
	SpecializedNodeShapeEncoder,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/nodeEncoder.js";
// eslint-disable-next-line import-x/no-internal-modules
import { schemaCompressedEncodeV2 } from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncode.js";
import {
	noSpecialization,
	schemaCompressedEncodeVTextExperimental,
	type SpecializationStrategy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncodeVText.js";
import {
	chunkFieldSingle,
	defaultChunkPolicy,
	defaultSchemaPolicy,
	fieldBatchCodecBuilder,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
} from "../../../../feature-libraries/index.js";
import {
	type ImplicitFieldSchema,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	type InsertableField,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	stringSchema,
	TreeViewConfigurationAlpha,
	type UnsafeUnknownSchema,
} from "../../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { toStoredSchema } from "../../../../simple-tree/toStoredSchema.js";
import { brand, type JsonCompatibleReadOnly } from "../../../../util/index.js";
import { ajvValidator } from "../../../codec/index.js";
import {
	fieldCursorFromInsertable,
	makeTestFieldBatchContexts,
	testIdCompressor,
} from "../../../utils.js";
import { assertChunkCursorBatchEquals } from "../fieldCursorTestUtilities.js";

const sf = new SchemaFactoryAlpha("test");
class TextNode extends sf.object("TextNode", { text: sf.string }) {}
class TextArray extends sf.array("TextArray", TextNode) {}

const storedSchema = toStoredSchema(TextArray, StagedSchemaUpgradePolicy.restrictive);

function makeTexts(texts: readonly string[]): TextArray {
	return new TextArray(texts.map((text) => new TextNode({ text })));
}

/**
 * The field batch codec with the vTextExperimental format selected.
 * @remarks
 * The format has no minVersionForCollab, so only an override selects it.
 * Decoding through the codec validates the data against the format schema and dispatches by version.
 */
const vTextCodec = fieldBatchCodecBuilder.build({
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
	writeVersionOverrides: new Map([
		[fieldBatchCodecBuilder.name, FieldBatchFormatVersion.vTextExperimental],
	]),
	allowPossiblyIncompatibleWriteVersionOverrides: true,
});

/** Encodes `root` with `strategy` in the vTextExperimental format. */
function encodeVText(
	root: TextArray,
	strategy: SpecializationStrategy,
): EncodedFieldBatchVTextExperimental {
	return schemaCompressedEncodeVTextExperimental(
		storedSchema,
		defaultSchemaPolicy,
		[fieldCursorFromInsertable<UnsafeUnknownSchema>(TextArray, root)],
		testIdCompressor,
		undefined /* incrementalEncoder */,
		false /* isSummary */,
		strategy,
	);
}

/** Decodes `encoded` and checks that it has one field that holds `root`. */
function checkDecodesTo(
	encoded: EncodedFieldBatchAnyVersion,
	schema: ImplicitFieldSchema,
	root: InsertableField<UnsafeUnknownSchema>,
	incrementalDecoder?: IncrementalDecoder,
): void {
	const { idDecodingContext } = makeTestFieldBatchContexts({
		encodeType: TreeCompressionStrategy.Compressed,
	}).decode;
	assertChunkCursorBatchEquals(decode(encoded, idDecodingContext, incrementalDecoder), [
		jsonableTreeFromFieldCursor(fieldCursorFromInsertable<UnsafeUnknownSchema>(schema, root)),
	]);
}

describe("schemaBasedEncodeVText", () => {
	it("writes the same data as V2 with the default strategy", () => {
		const root = makeTexts(["a", "a", "b"]);
		const encoded = encodeVText(root, noSpecialization);
		const encodedV2 = schemaCompressedEncodeV2(
			storedSchema,
			defaultSchemaPolicy,
			[fieldCursorFromInsertable<UnsafeUnknownSchema>(TextArray, root)],
			testIdCompressor,
			undefined /* incrementalEncoder */,
			false /* isSummary */,
		);
		assert.equal(encoded.version, FieldBatchFormatVersion.vTextExperimental);
		assert.deepEqual({ ...encoded, version: encodedV2.version }, encodedV2);
	});

	it("encodes the specialized shape that the strategy returns", () => {
		const root = makeTexts(["same", "same"]);
		// Hard-codes a specialized shape for TextNode that keeps the `text` field as the constant "same".
		const strategy: SpecializationStrategy = () => (base, schemaName) =>
			schemaName === TextNode.identifier
				? new SpecializedNodeShapeEncoder(base, [
						{
							key: brand<FieldKey>("text"),
							encoder: asFieldEncoder(
								new NodeShapeBasedEncoder(
									brand<TreeNodeSchemaIdentifier>(stringSchema.identifier),
									["same"],
									[],
									undefined,
								),
							),
						},
					])
				: base;

		const encoded = encodeVText(root, strategy);
		const { shapes, identifiers } = encoded;
		// An identifier in a shape is either inline or an index into `identifiers`.
		const resolve = (id: string | number | undefined): string | undefined =>
			typeof id === "number" ? identifiers[id] : id;

		const specialized = shapes.flatMap((shape) => (shape.f === undefined ? [] : [shape.f]));
		assert.equal(specialized.length, 1);
		const { base: baseIndex, fields } =
			specialized[0] ?? assert.fail("missing specialized shape");
		// The specialized shape refers to the TextNode node shape.
		assert.equal(resolve(shapes[baseIndex]?.c?.type), TextNode.identifier);
		// Its only override replaces the "text" field with a shape that keeps the constant "same".
		assert.deepEqual(
			fields?.map(([key, shapeIndex]) => [resolve(key), shapes[shapeIndex]?.c?.value]),
			[["text", ["same"]]],
		);
		// The shape keeps the value, so the data does not.
		assert(!JSON.stringify(encoded.data).includes("same"));

		// Decoding through the codec also validates the specialized shape against the format schema.
		const decoded = vTextCodec.decode(
			encoded as JsonCompatibleReadOnly,
			makeTestFieldBatchContexts({ encodeType: TreeCompressionStrategy.Compressed }).decode,
		);
		assert.deepEqual(decoded.map(jsonableTreeFromFieldCursor), [
			jsonableTreeFromFieldCursor(
				fieldCursorFromInsertable<UnsafeUnknownSchema>(TextArray, root),
			),
		]);
	});

	it("encodes incremental chunks in the vTextExperimental format", () => {
		class Doc extends sf.object("Doc", {
			texts: sf.types([{ type: TextArray, metadata: {} }], {
				custom: { [incrementalSummaryHint]: true },
			}),
		}) {}
		const doc = new Doc({ texts: makeTexts(["a", "b"]) });
		const chunks = new Map<ChunkReferenceId, EncodedFieldBatchAnyVersion>();
		const incrementalEncoder: IncrementalEncoder = {
			shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
				new TreeViewConfigurationAlpha({ schema: Doc }),
			),
			encodeIncrementalField: (cursor, chunkEncoder) => {
				const referenceId: ChunkReferenceId = brand(chunks.size);
				const chunk = chunkFieldSingle(cursor, {
					policy: defaultChunkPolicy,
					idCompressor: testIdCompressor,
				});
				chunks.set(referenceId, chunkEncoder(chunk));
				return [referenceId];
			},
		};

		const encoded = schemaCompressedEncodeVTextExperimental(
			toStoredSchema(Doc, StagedSchemaUpgradePolicy.restrictive),
			defaultSchemaPolicy,
			[fieldCursorFromInsertable<UnsafeUnknownSchema>(Doc, doc)],
			testIdCompressor,
			incrementalEncoder,
			true /* isSummary */,
			noSpecialization,
		);
		assert.equal(chunks.size, 1);
		assert.equal(chunks.get(brand(0))?.version, FieldBatchFormatVersion.vTextExperimental);
		checkDecodesTo(encoded, Doc, doc, {
			decodeIncrementalChunk: (referenceId, chunkDecoder) =>
				chunkDecoder(chunks.get(referenceId) ?? assert.fail("missing chunk")),
		});
	});

	describe("through the field batch codec", () => {
		const contexts = makeTestFieldBatchContexts({
			encodeType: TreeCompressionStrategy.Compressed,
			schema: { schema: storedSchema, policy: defaultSchemaPolicy },
		});

		/** Decodes `batch` with the codec and checks that it has one field with `expected`. */
		function checkDecode(
			batch: EncodedFieldBatchVTextExperimental,
			expected: JsonableTree[],
		): void {
			const decoded = vTextCodec.decode(batch as JsonCompatibleReadOnly, contexts.decode);
			assert.deepEqual(decoded.map(jsonableTreeFromFieldCursor), [expected]);
		}

		// The batches below are written by hand. Each one uses specialized (`f`) shapes.
		// The default strategy never writes these shapes, so these tests are the only coverage
		// of their decoding through the codec.
		// Encoding through the codec is covered for every format by the test trees in schemaBasedEncode.spec.ts.

		it("decodes a field override", () => {
			checkDecode(
				{
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a node with a variable boolean field "bold".
						{ c: { type: "Format", value: false, fields: [["bold", 1]] } },
						// 1: a variable boolean.
						{ c: { type: "boolean", value: true } },
						// 2: the constant boolean false.
						{ c: { type: "boolean", value: [false] } },
						// 3: shape 0 with "bold" kept as the constant false.
						{ f: { base: 0, fields: [["bold", 2]] } },
					],
					// The node uses shape 3, so "bold" writes no data.
					data: [[3]],
				},
				[
					{
						type: brand("Format"),
						fields: { bold: [{ type: brand("boolean"), value: false }] },
					},
				],
			);
		});

		it("decodes a value override", () => {
			checkDecode(
				{
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a string leaf with a variable value.
						{ c: { type: "string", value: true } },
						// 1: shape 0 with the constant value "pinned".
						{ f: { base: 0, value: ["pinned"] } },
					],
					data: [[1]],
				},
				[{ type: brand("string"), value: "pinned" }],
			);
		});

		it("decodes a specialized shape of a specialized shape", () => {
			checkDecode(
				{
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a node with the variable boolean fields "bold" and "italic".
						{
							c: {
								type: "Format",
								value: false,
								fields: [
									["bold", 1],
									["italic", 1],
								],
							},
						},
						// 1: a variable boolean.
						{ c: { type: "boolean", value: true } },
						// 2: the constant boolean true.
						{ c: { type: "boolean", value: [true] } },
						// 3: shape 0 with "bold" kept as true.
						{ f: { base: 0, fields: [["bold", 2]] } },
						// 4: shape 3 with "italic" also kept as true.
						{ f: { base: 3, fields: [["italic", 2]] } },
					],
					data: [[4]],
				},
				[
					{
						type: brand("Format"),
						fields: {
							bold: [{ type: brand("boolean"), value: true }],
							italic: [{ type: brand("boolean"), value: true }],
						},
					},
				],
			);
		});

		it("decodes specialized shapes in a field that can contain more than one shape", () => {
			checkDecode(
				{
					version: FieldBatchFormatVersion.vTextExperimental,
					identifiers: [],
					shapes: [
						// 0: a node with a sequence field "items".
						{ c: { type: "Doc", value: false, fields: [["items", 1]] } },
						// 1: a sequence of items, where each item writes its own shape.
						{ a: 2 },
						// 2: any shape.
						{ d: 0 },
						// 3: an item with a variable boolean field "bold".
						{ c: { type: "Item", value: false, fields: [["bold", 4]] } },
						// 4: a variable boolean.
						{ c: { type: "boolean", value: true } },
						// 5: the constant boolean false.
						{ c: { type: "boolean", value: [false] } },
						// 6: shape 3 with "bold" kept as false.
						{ f: { base: 3, fields: [["bold", 5]] } },
					],
					// The first item uses shape 6 and writes no data.
					// The second item uses shape 3 and writes its value of "bold".
					data: [[0, [6, 3, true]]],
				},
				[
					{
						type: brand("Doc"),
						fields: {
							items: [
								{
									type: brand("Item"),
									fields: { bold: [{ type: brand("boolean"), value: false }] },
								},
								{
									type: brand("Item"),
									fields: { bold: [{ type: brand("boolean"), value: true }] },
								},
							],
						},
					},
				],
			);
		});
	});
});
