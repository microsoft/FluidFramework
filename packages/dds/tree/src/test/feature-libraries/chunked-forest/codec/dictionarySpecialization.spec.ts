/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { currentVersion } from "../../../../codec/index.js";
import type { TreeStoredSchema } from "../../../../core/index.js";
import type {
	EncodedFieldBatchAnyVersion,
	EncodedFieldBatchVTextExperimental,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { dictionarySpecialization } from "../../../../feature-libraries/chunked-forest/codec/dictionarySpecialization.js";
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
	FieldBatchFormatVersion,
	fieldBatchCodecBuilder,
	type IncrementalEncodingPolicy,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
} from "../../../../feature-libraries/index.js";
import {
	type ImplicitFieldSchema,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	toStoredSchema,
	type UnsafeUnknownSchema,
} from "../../../../simple-tree/index.js";
import { PlainText } from "../../../../text/index.js";
import { brand, type JsonCompatibleReadOnly } from "../../../../util/index.js";
import { ajvValidator } from "../../../codec/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextTest } from "../../../text/formattedTextTest.js";
import {
	fieldCursorFromInsertable,
	makeTestFieldBatchContexts,
	testIdCompressor,
} from "../../../utils.js";

/**
 * The field batch codec that writes the vTextExperimental format.
 * @remarks
 * A decode through the codec also validates the data against the format schema.
 */
const vTextCodec = fieldBatchCodecBuilder.build({
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
	writeVersionOverrides: new Map([
		[fieldBatchCodecBuilder.name, FieldBatchFormatVersion.vTextExperimental],
	]),
	allowPossiblyIncompatibleWriteVersionOverrides: true,
});

const textSchema = toStoredSchema(
	FormattedTextTest.Tree,
	StagedSchemaUpgradePolicy.restrictive,
);

const plainTextSchema = toStoredSchema(PlainText.Tree, StagedSchemaUpgradePolicy.restrictive);

/** Encodes `root` with `strategy` in the vTextExperimental format. */
function encode(
	schema: ImplicitFieldSchema,
	storedSchema: TreeStoredSchema,
	root: unknown,
	strategy: SpecializationStrategy,
): EncodedFieldBatchVTextExperimental {
	return schemaCompressedEncodeVTextExperimental(
		storedSchema,
		defaultSchemaPolicy,
		[fieldCursorFromInsertable<UnsafeUnknownSchema>(schema, root as never)],
		testIdCompressor,
		undefined /* incrementalEncoder */,
		false /* isSummary */,
		strategy,
	);
}

/** Encodes `root` with {@link dictionarySpecialization}, and makes sure that the result decodes to `root`. */
function encodeAndCheck(
	schema: ImplicitFieldSchema,
	storedSchema: TreeStoredSchema,
	root: unknown,
): EncodedFieldBatchVTextExperimental {
	const encoded = encode(schema, storedSchema, root, dictionarySpecialization);
	const decoded = vTextCodec.decode(
		encoded as JsonCompatibleReadOnly,
		makeTestFieldBatchContexts({ encodeType: TreeCompressionStrategy.Compressed }).decode,
	);
	assert.deepEqual(decoded.map(jsonableTreeFromFieldCursor), [
		jsonableTreeFromFieldCursor(
			fieldCursorFromInsertable<UnsafeUnknownSchema>(schema, root as never),
		),
	]);
	return encoded;
}

/** Gets the constant values of the leaf shapes in `encoded`. */
function constantLeafValues(encoded: EncodedFieldBatchVTextExperimental): unknown[] {
	return encoded.shapes.flatMap((shape): unknown[] =>
		Array.isArray(shape.c?.value) ? [shape.c.value[0] as unknown] : [],
	);
}

describe("dictionarySpecialization", () => {
	it("pins the format and writes common characters as shape indexes", () => {
		const text = FormattedTextTest.Tree.fromString("ab".repeat(200));
		const encoded = encodeAndCheck(FormattedTextTest.Tree, textSchema, text);
		const data = JSON.stringify(encoded.data);
		// The format changes rarely, so the shape of the atoms holds it.
		assert(!data.includes("Arial"));
		// The characters change on each atom, so they use the dictionary instead.
		assert(!data.includes('"a"'));
		assert(!data.includes('"b"'));
		const constants = constantLeafValues(encoded);
		assert(constants.includes("a"));
		assert(constants.includes("Arial"));
	});

	it("writes rare characters as values", () => {
		const text = FormattedTextTest.Tree.fromString(`${"ab".repeat(200)}Q`);
		const encoded = encodeAndCheck(FormattedTextTest.Tree, textSchema, text);
		assert(JSON.stringify(encoded.data).includes('"Q"'));
		assert(!constantLeafValues(encoded).includes("Q"));
	});

	it("starts a new run where the format changes", () => {
		const text = FormattedTextTest.Tree.fromString("");
		for (let index = 0; index < 10; index++) {
			text.insertAt(text.characterCount(), "abcdefgh".repeat(4), {
				bold: false,
				size: 12,
				font: "Arial",
			});
			text.insertAt(text.characterCount(), "abcdefgh", {
				bold: true,
				size: 12,
				font: "Arial",
			});
		}
		const encoded = encodeAndCheck(FormattedTextTest.Tree, textSchema, text);
		const constants = constantLeafValues(encoded);
		assert(constants.includes(true));
		assert(constants.includes(false));
		// The nested array shapes are the single-type sequence and one run shape for each format.
		assert.equal(encoded.shapes.filter((shape) => shape.a !== undefined).length, 3);
	});

	it("round-trips text with line atoms and many formats", () => {
		const text = FormattedTextTest.Tree.fromString("");
		for (let index = 0; index < 50; index++) {
			text.insertAt(text.characterCount(), "abcde", {
				bold: index % 2 === 0,
				size: index % 3,
				font: `font-${index % 5}`,
			});
			text.insertAt(text.characterCount(), [
				new FormattedTextTest.StringLineAtom({
					tag: FormattedTextTest.LineTag(index % 2 === 0 ? "h1" : "h2"),
					indent: index % 4,
				}),
			]);
		}
		encodeAndCheck(FormattedTextTest.Tree, textSchema, text);
	});

	it("uses a dictionary for plain text", () => {
		const text = PlainText.Tree.fromString("abc".repeat(100));
		const encoded = encodeAndCheck(PlainText.Tree, plainTextSchema, text);
		assert(!JSON.stringify(encoded.data).includes('"a"'));
	});

	it("writes a run of nodes without data as its length", () => {
		const text = PlainText.Tree.fromString("a".repeat(100));
		const encoded = encodeAndCheck(PlainText.Tree, plainTextSchema, text);
		assert(JSON.stringify(encoded.data).includes(",100]"));
	});

	it("does not pin a leaf that only some items have, if its value changes", () => {
		const sf = new SchemaFactoryAlpha("test");
		class A extends sf.object("A", { s: sf.string }) {}
		class B extends sf.object("B", { n: sf.number }) {}
		class Item extends sf.object("Item", { child: [A, B] }) {}
		class Items extends sf.array("Items", Item) {}
		const schema = toStoredSchema(Items, StagedSchemaUpgradePolicy.restrictive);
		// Only the even items have `A.s`, and each value of `A.s` is different.
		const root = new Items(
			Array.from(
				{ length: 200 },
				(_, index) =>
					new Item({
						child: index % 2 === 0 ? new A({ s: `value-${index}` }) : new B({ n: 1 }),
					}),
			),
		);
		const encoded = encodeAndCheck(Items, schema, root);
		assert(!constantLeafValues(encoded).includes("value-0"));
		assert(
			JSON.stringify(encoded).length <=
				JSON.stringify(encode(Items, schema, root, noSpecialization)).length,
		);
	});

	it("does not put a value that occurs one time in the dictionary", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Strings extends sf.array("Strings", sf.string) {}
		const schema = toStoredSchema(Strings, StagedSchemaUpgradePolicy.restrictive);
		// Long values that are all different. A constant leaf shape for one of them costs more than it saves.
		const values = Array.from(
			{ length: 20 },
			(_, index) => `a long value that is different: ${index}`,
		);
		const encoded = encodeAndCheck(Strings, schema, new Strings(values));
		assert.deepEqual(constantLeafValues(encoded), []);
	});

	it("does not use a dictionary if its shape indexes cost more than they save", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Strings extends sf.array("Strings", sf.string) {}
		const schema = toStoredSchema(Strings, StagedSchemaUpgradePolicy.restrictive);
		// 1000 short values. Most of them would get a shape index that is as long as the value.
		const values = Array.from({ length: 1000 }, (_, index) => `${index}`.padStart(2, "x"));
		const root = new Strings(
			Array.from({ length: 14000 }, (_, index) => values[index % 1000]),
		);
		const encoded = encodeAndCheck(Strings, schema, root);
		assert.deepEqual(constantLeafValues(encoded), []);
	});

	it("does not pin a leaf if its constant shapes cost more than they save", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Numbers extends sf.array("Numbers", sf.number) {}
		const schema = toStoredSchema(Numbers, StagedSchemaUpgradePolicy.restrictive);
		// Each value is in a run of 8 items, but each value needs its own shapes.
		const root = new Numbers(
			Array.from({ length: 8000 }, (_, index) => Math.floor(index / 8)),
		);
		const encoded = encodeAndCheck(Numbers, schema, root);
		assert.deepEqual(constantLeafValues(encoded), []);
	});

	it("keeps a pin if it saves more bytes than its signatures and runs cost", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Item extends sf.object("Item", { flag: sf.boolean }) {}
		class Items extends sf.array("Items", Item) {}
		const schema = toStoredSchema(Items, StagedSchemaUpgradePolicy.restrictive);
		// 80 items in runs of 8. Without the pin, the flag uses the dictionary. Then each item holds a shape index and a comma.
		// The pin removes these 160 bytes, and its 2 signatures and 10 runs cost less.
		const root = new Items(
			Array.from(
				{ length: 80 },
				(_, index) => new Item({ flag: Math.floor(index / 8) % 2 === 0 }),
			),
		);
		const encoded = encodeAndCheck(Items, schema, root);
		// Each value of the flag has a specialized item shape.
		assert.equal(encoded.shapes.filter((shape) => shape.f !== undefined).length, 2);
	});

	it("unpins a leaf if its signatures and runs cost more bytes than the pin saves", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Item extends sf.object("Item", { tag: sf.string }) {}
		class Items extends sf.array("Items", Item) {}
		const schema = toStoredSchema(Items, StagedSchemaUpgradePolicy.restrictive);
		// 160 items with 8 values in runs of 8. The tag is pinned first, because its value changes one time in 8 items.
		// The pin removes a shape index and a comma from each item, but it adds 8 signatures and 20 runs.
		const values = ["aaaa", "bbbb", "cccc", "dddd", "eeee", "ffff", "gggg", "hhhh"];
		const root = new Items(
			Array.from(
				{ length: 160 },
				(_, index) => new Item({ tag: values[Math.floor(index / 8) % values.length] }),
			),
		);
		const encoded = encodeAndCheck(Items, schema, root);
		// The tag uses the dictionary, so its values have constant leaf shapes.
		assert.deepEqual(constantLeafValues(encoded).sort(), values);
		// All items have one signature, so they are one run.
		// The nested array shapes are the single-type sequence and the shape of that run.
		assert.equal(encoded.shapes.filter((shape) => shape.a !== undefined).length, 2);
	});

	it("unpins a leaf if its rare values cost more bytes than its common value saves", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Item extends sf.object("Item", { n: sf.number }) {}
		class Items extends sf.array("Items", Item) {}
		const schema = toStoredSchema(Items, StagedSchemaUpgradePolicy.restrictive);
		// 2000 zeros, then 100 different values. On average, each value is in 21 items, and the value changes one time in 21 items.
		// So the leaf is pinned first. But each of the 100 values is in only one item, and adds a signature and a run.
		const values = [
			...Array.from({ length: 2000 }, () => 0),
			...Array.from({ length: 100 }, (_, index) => index + 1),
		];
		const encoded = encodeAndCheck(
			Items,
			schema,
			new Items(values.map((n) => new Item({ n }))),
		);
		assert.deepEqual(constantLeafValues(encoded), []);
	});

	it("unpins a leaf if the signatures of the pinned leaves together cost more bytes than the pins save", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Item extends sf.object("Item", { a: sf.number, b: sf.number }) {}
		class Items extends sf.array("Items", Item) {}
		const schema = toStoredSchema(Items, StagedSchemaUpgradePolicy.restrictive);
		// 400 items. Each leaf has 8 values in runs of 10, so each leaf is pinned first.
		// If only one leaf is pinned, the pin saves more bytes than its 8 signatures and approximately 40 runs cost.
		// The runs of `b` start 5 items after the runs of `a`, so the two pins together make 16 signatures and 80 runs.
		// These cost more bytes than one pin saves, so the strategy unpins one leaf.
		const root = new Items(
			Array.from(
				{ length: 400 },
				(_, index) =>
					new Item({
						a: Math.floor(index / 10) % 8,
						b: Math.floor((index + 5) / 10) % 8,
					}),
			),
		);
		const encoded = encodeAndCheck(Items, schema, root);
		// Each value of the leaf that stays pinned has a specialized item shape. With two pinned leaves, there are 16.
		assert.equal(encoded.shapes.filter((shape) => shape.f !== undefined).length, 8);
	});

	it("does not pin a leaf with more values than it counts", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Numbers extends sf.array("Numbers", sf.number) {}
		const schema = toStoredSchema(Numbers, StagedSchemaUpgradePolicy.restrictive);
		// 2500 values, each in a run of 8 items. The strategy counts only the first 1000 values.
		const root = new Numbers(
			Array.from({ length: 20000 }, (_, index) => Math.floor(index / 8)),
		);
		const encoded = encodeAndCheck(Numbers, schema, root);
		assert.deepEqual(constantLeafValues(encoded), []);
	});

	it("round-trips recursive items that are deeper than the read depth", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Link extends sf.objectRecursive("Link", { next: [() => Link, sf.number] }) {}
		class Links extends sf.array("Links", Link) {}
		const schema = toStoredSchema(Links, StagedSchemaUpgradePolicy.restrictive);
		// Each item is a chain of 6 links, so the strategy stops reading before the end of the chain.
		const items = Array.from({ length: 20 }, (_, index) => {
			let item = new Link({ next: index % 3 });
			for (let depth = 1; depth < 6; depth++) {
				item = new Link({ next: item });
			}
			return item;
		});
		encodeAndCheck(Links, schema, new Links(items));
	});

	it("round-trips incremental fields", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Format extends sf.object("Format", { bold: sf.boolean }) {}
		class Item extends sf.object("Item", { character: sf.string, format: Format }) {}
		class Items extends sf.array("Items", Item) {}
		const schema = toStoredSchema(Items, StagedSchemaUpgradePolicy.restrictive);
		const root = new Items(
			Array.from(
				{ length: 20 },
				(_, index) =>
					new Item({ character: index % 2 === 0 ? "a" : "b", format: { bold: false } }),
			),
		);
		// The strategy does not change these incremental fields: the single-type sequence, and a tracked field of its items.
		const policies: IncrementalEncodingPolicy[] = [
			(type) => type === Items.identifier,
			(_type, key) => key === "format",
		];
		for (const policy of policies) {
			const chunks: EncodedFieldBatchAnyVersion[] = [];
			const encoded = schemaCompressedEncodeVTextExperimental(
				schema,
				defaultSchemaPolicy,
				[fieldCursorFromInsertable<UnsafeUnknownSchema>(Items, root)],
				testIdCompressor,
				{
					shouldEncodeIncrementally: policy,
					encodeIncrementalField: (cursor, chunkEncoder) => {
						const chunk = chunkFieldSingle(cursor, {
							policy: defaultChunkPolicy,
							idCompressor: testIdCompressor,
						});
						chunks.push(chunkEncoder(chunk));
						return [brand(chunks.length - 1)];
					},
				},
				true /* isSummary */,
				dictionarySpecialization,
			);
			assert(chunks.length > 0);
			const decoded = vTextCodec.decode(
				encoded as JsonCompatibleReadOnly,
				makeTestFieldBatchContexts({
					encodeType: TreeCompressionStrategy.Compressed,
					isSummary: true,
					incrementalDecoder: {
						decodeIncrementalChunk: (referenceId, chunkDecoder) =>
							chunkDecoder(chunks[referenceId] ?? assert.fail("missing chunk")),
					},
				}).decode,
			);
			assert.deepEqual(decoded.map(jsonableTreeFromFieldCursor), [
				jsonableTreeFromFieldCursor(
					fieldCursorFromInsertable<UnsafeUnknownSchema>(Items, root),
				),
			]);
		}
	});

	it("writes the same data as no specialization when the schema has no single-type sequence", () => {
		const sf = new SchemaFactoryAlpha("test");
		class Link extends sf.objectRecursive("Link", { next: [() => Link, sf.number] }) {}
		const schema = toStoredSchema(Link, StagedSchemaUpgradePolicy.restrictive);
		let root: Link | number = 0;
		for (let index = 0; index < 50; index++) {
			root = new Link({ next: root });
		}
		assert.deepEqual(
			encode(Link, schema, root, dictionarySpecialization),
			encode(Link, schema, root, noSpecialization),
		);
	});
});
