/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { Tree, TreeAlpha } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Importing code being tested
import { setEnableExpensiveDebugAsserts } from "../../text/textDomain.js";
// eslint-disable-next-line import-x/no-internal-modules -- Importing code being tested
import type { PlainText } from "../../text/textDomain.js";
import {
	FormattedText,
	StringTextAtomNode,
	// eslint-disable-next-line import-x/no-internal-modules -- Importing code being tested
} from "../../text/textDomainFormatted.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";
import { testSchemaCompatibilitySnapshots } from "../snapshots/index.js";
import { suitesWithAndWithoutProduction } from "../utils.js";
import { FormattedTextTest } from "./formattedTextTest.js";
import { oneFromIterable } from "../../util/index.js";

// Custom formatted-text schemas used to exercise `formatRange` edge cases which the default schema cannot express.

// A format with an optional field, used to test formatting of optional fields.
const optionalFormatFactory = new SchemaFactoryBeta("test.formatted.optional");
class OptionalFormat extends optionalFormatFactory.object("OptionalFormat", {
	bold: SchemaFactory.boolean,
	color: SchemaFactory.optional(SchemaFactory.string),
}) {}
class OptionalFormatText extends FormattedText.createSchema(
	optionalFormatFactory,
	OptionalFormat,
	[],
	{ bold: false },
) {}

// A format which is a union of an object node and a non-object (leaf) node.
// Used to test that `formatRange` rejects non-object node formats, including when they only occur partway through a range.
const unionFormatFactory = new SchemaFactoryBeta("test.formatted.union");
class UnionFormat extends unionFormatFactory.object("UnionFormat", {
	bold: SchemaFactory.boolean,
}) {}
class UnionFormatText extends FormattedText.createSchema(
	unionFormatFactory,
	[UnionFormat, SchemaFactory.number],
	[],
	new UnionFormat({ bold: false }),
) {}

describe("textDomainFormatted", () => {
	beforeEach(() => {
		setEnableExpensiveDebugAsserts(true);
	});
	afterEach(() => {
		setEnableExpensiveDebugAsserts(false);
	});

	it("compatibility-minimal", () => {
		const scopingFactory = new SchemaFactoryBeta("minimal");
		const currentViewSchema = new TreeViewConfiguration({
			schema: FormattedText.createSchema(scopingFactory, SchemaFactory.null, [], null),
		});
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.114.0", "formattedText-minimal");
	});

	it("compatibility-basic", () => {
		const scopingFactory = new SchemaFactoryBeta("basic");
		class Format extends scopingFactory.object("Format", { bold: SchemaFactory.boolean }) {}
		class Atom extends scopingFactory.object("Atom", {}) implements FormattedText.TextAtom {
			public readonly content: string = "x";
		}
		const currentViewSchema = new TreeViewConfiguration({
			schema: FormattedText.createSchema(scopingFactory, Format, [Atom], {
				bold: false,
			}),
		});
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.114.0", "formattedText-simple");
	});

	it("supports recursive additional atom schemas", () => {
		const scopingFactory = new SchemaFactoryBeta("test.formatted.recursive");
		class Format extends scopingFactory.object("Format", { bold: SchemaFactory.boolean }) {}
		class RecursiveAtom
			extends scopingFactory.objectRecursive("RecursiveAtom", {
				text: scopingFactory.optionalRecursive([() => RecursiveText]),
			})
			implements FormattedText.TextAtom
		{
			public get content(): string {
				return `{${this.text?.fullString() ?? ""}}`;
			}
		}
		type _checkRecursiveAtom = ValidateRecursiveSchema<typeof RecursiveAtom>;

		class RecursiveText extends FormattedText.createSchema(
			scopingFactory,
			Format,
			[RecursiveAtom],
			{ bold: false },
		) {}

		const nestedText = RecursiveText.fromString("inside");
		const text = RecursiveText.fromString("outside");
		text.insertAt(7, [new RecursiveAtom({ text: nestedText })]);

		assert.equal(text.fullString(), "outside{inside}");
		const insertedAtom = text.charactersWithFormatting()[7]?.content;
		assert(insertedAtom instanceof RecursiveAtom);
		assert.equal(insertedAtom.text?.fullString(), "inside");
	});

	it("compatibility-test", () => {
		const currentViewSchema = new TreeViewConfiguration({
			schema: FormattedTextTest.Tree,
		});
		testSchemaCompatibilitySnapshots(currentViewSchema, "3.5.0", "formattedText-test");
	});

	it("@Smoke basic unformatted use", () => {
		const text = FormattedTextTest.Tree.fromString("hello");
		assert.equal(text.fullString(), "hello");
		assert.deepEqual([...text.characters()], ["h", "e", "l", "l", "o"]);
		text.insertAt(5, " world");
		assert.equal(text.fullString(), "hello world");
		text.removeRange(0, 6);
		assert.equal(text.fullString(), "world");
	});

	it("moves a range of characters", () => {
		const text = FormattedTextTest.Tree.fromString("abcdef");
		text.formatRange(3, 5, { bold: true });

		text.moveRangeToIndex(1, 3, 5);
		assert.equal(text.fullString(), "adebcf");
		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => [
				atom.content.content,
				atom.format.bold,
			]),
			[
				["a", false],
				["d", true],
				["e", true],
				["b", false],
				["c", false],
				["f", false],
			],
		);
	});

	it("default formatting", () => {
		class Custom extends FormattedText.createSchema(
			new SchemaFactoryBeta("test.formatted.custom"),
			[SchemaFactory.null, SchemaFactory.number],
			[],
			5,
		) {}
		{
			const text = Custom.fromString("x");
			const atom = oneFromIterable(text.charactersWithFormatting()) ?? assert.fail();
			assert.equal(atom.format, 5);
			atom.format = 4;
			assert.equal(atom.format, 4);
			text.reformat();
			assert.equal(atom.format, 5);
			text.insertAt(1, "y", null); // Ensure this overrides default correctly, even when null.
			text.insertAt(2, "z"); // Uses default
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom2) => atom2.format),
				[5, null, 5],
			);
		}
	});

	it("fromString applies the provided format", () => {
		const format = {
			bold: true,
			size: 24,
			font: "Times New Roman",
		};
		const text = FormattedTextTest.Tree.fromString("ab", format);

		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => ({ ...atom.format })),
			[format, format],
		);
	});

	describe("StringTextAtom", () => {
		it("fromCharacter creates one atom", () => {
			assert.equal(FormattedText.StringTextAtom.fromCharacter("a").content, "a");
			assert.equal(FormattedText.StringTextAtom.fromCharacter("😀").content, "😀");
		});

		it("fromCharacter rejects values which are not one character", () => {
			assert.throws(
				() => FormattedText.StringTextAtom.fromCharacter(""),
				validateUsageError(/exactly one Unicode character/),
			);
			assert.throws(
				() => FormattedText.StringTextAtom.fromCharacter("ab"),
				validateUsageError(/exactly one Unicode character/),
			);
		});

		it("fromString creates one atom per character", () => {
			const atoms = FormattedText.StringTextAtom.fromString("a😀b");
			assert.deepEqual(
				atoms.map((atom) => atom.content),
				["a", "😀", "b"],
			);
			const empty = FormattedText.StringTextAtom.fromString("");
			assert.deepEqual(empty, []);
		});
	});

	describe("formatRange", () => {
		for (const kind of ["object", "record", "map"] as const) {
			describeHydration(`reusing ${kind} formats`, (_init, hydrated) => {
				const factory = new SchemaFactoryBeta(`test.formatted.reuse.${kind}`);
				/**
				 * A node-valued formatting property, rather than a leaf, so copying it requires cloning a subtree.
				 * Its mutable color also lets the test detect aliases between the source and destination atoms.
				 */
				class Detail extends factory.object("Detail", { color: SchemaFactory.string }) {}
				/** Exercises the object-field update path with a required child node. */
				const ObjectFormat = factory.object("ObjectFormat", { detail: Detail });
				/** Exercises the record-entry update path with node-valued entries. */
				const RecordFormat = factory.record("RecordFormat", Detail);
				/** Exercises the map-entry update path, including reading the update through its iterator. */
				const MapFormat = factory.map("MapFormat", Detail);
				/** Selects the format kind used by every atom in this test case. */
				const Format =
					kind === "object" ? ObjectFormat : kind === "record" ? RecordFormat : MapFormat;
				/**
				 * Text with a node-valued default format and no additional atom types.
				 * The schema allows all three format kinds to share the test setup, but each case uses only the selected kind.
				 * Explicitly constructing that kind disambiguates the otherwise identical default data.
				 */
				class Text extends FormattedText.createSchema(
					factory,
					[ObjectFormat, RecordFormat, MapFormat],
					[],
					new Format({ detail: new Detail({ color: "red" }) }),
				) {}

				it("copies an existing atom's node-valued format independently", () => {
					const text = Text.fromString("abcd");
					// Hydrate before reading the source format so its Detail is already in the tree when copied.
					// Hydrating only the destination while supplying a new Detail would not reproduce the bug.
					// The unhydrated case is a control for copying a child that already has a parent but is not hydrated.
					if (hydrated) {
						hydrateNode(text);
					}
					const atoms = text.charactersWithFormatting();
					const originalFormats = atoms.map((atom) => atom.format);
					// All atoms start with the same color, so value comparisons alone cannot detect a no-op.
					// Keep the original child identities to verify which subtrees are replaced.
					const originalDetails = originalFormats.map((format) => {
						const detail = Tree.is(format, MapFormat) ? format.get("detail") : format.detail;
						assert(detail instanceof Detail);
						return detail;
					});

					// Copy the first atom's existing format onto two destinations, leaving the source and last atom untouched.
					// Clone the hydrated source's children rather than treating them as insertable input to TreeBeta.create.
					text.formatRange(1, 3, atoms[0].format);

					const details = atoms.map((atom, index) => {
						// A partial format update must preserve the enclosing format node.
						assert.equal(atom.format, originalFormats[index]);
						const detail = Tree.is(atom.format, MapFormat)
							? atom.format.get("detail")
							: atom.format.detail;
						assert(detail instanceof Detail);
						return detail;
					});
					assert.equal(text.fullString(), "abcd");
					assert.deepEqual(
						details.map((detail) => detail.color),
						["red", "red", "red", "red"],
					);
					assert.equal(new Set(details).size, 4);
					assert.equal(details[0], originalDetails[0]);
					assert.equal(details[3], originalDetails[3]);
					assert.notEqual(details[1], originalDetails[1]);
					assert.notEqual(details[2], originalDetails[2]);

					// Editing one copy must not affect the source, the other copy, or the atom outside the range.
					details[1].color = "blue";
					assert.deepEqual(
						details.map((detail) => detail.color),
						["red", "blue", "red", "red"],
					);
				});

				it("rejects values not allowed by the destination schema", () => {
					const text = Text.fromString("abcd");
					if (hydrated) {
						hydrateNode(text);
					}
					assert.throws(
						() =>
							// @ts-expect-error Testing invalid input.
							text.formatRange(1, 3, { detail: 42 }),
						validateUsageError(/incompatible with all of the types allowed by the schema/),
					);
				});

				if (kind === "object") {
					it("rejects unknown object fields", () => {
						const text = Text.fromString("abcd");
						if (hydrated) {
							hydrateNode(text);
						}
						assert.throws(
							() => text.formatRange(1, 3, { unknown: new Detail({ color: "red" }) }),
							validateUsageError("Unknown format key: unknown"),
						);
					});
				}
			});
		}

		for (const kind of ["record", "map"] as const) {
			describeHydration(`${kind} formats`, (_init, hydrated) => {
				const factory = new SchemaFactoryBeta(`test.formatted.${kind}`);
				class Detail extends factory.object("Detail", { color: SchemaFactory.string }) {}
				const allowedTypes = [SchemaFactory.boolean, SchemaFactory.string, Detail] as const;
				const RecordFormat = factory.record("RecordFormat", allowedTypes);
				const MapFormat = factory.map("MapFormat", allowedTypes);
				const defaultFormat = { bold: false, font: "Arial" };
				class Text extends FormattedText.createSchema(
					factory,
					[RecordFormat, MapFormat],
					[],
					kind === "record" ? new RecordFormat(defaultFormat) : new MapFormat(defaultFormat),
				) {}

				function makeText(): Text {
					const text = Text.fromString("abcd");
					if (hydrated) {
						hydrateNode(text);
					}
					return text;
				}

				it("adds and overwrites entries without changing other formatting", () => {
					const text = makeText();
					text.formatRange(1, 3, { bold: true, color: "red" });
					assert.equal(text.fullString(), "abcd");
					assert.deepEqual(
						text.charactersWithFormatting().map((atom) => Object.fromEntries(atom.format)),
						[
							{ bold: false, font: "Arial" },
							{ bold: true, font: "Arial", color: "red" },
							{ bold: true, font: "Arial", color: "red" },
							{ bold: false, font: "Arial" },
						],
					);
				});

				it("removes entries with undefined and ignores missing entries", () => {
					const text = makeText();
					text.formatRange(1, 3, { bold: undefined, missing: undefined });
					assert.deepEqual(
						text.charactersWithFormatting().map((atom) => Object.fromEntries(atom.format)),
						[
							{ bold: false, font: "Arial" },
							{ font: "Arial" },
							{ font: "Arial" },
							{ bold: false, font: "Arial" },
						],
					);
				});

				it("supports different format schemas in the same range", () => {
					const text = makeText();
					text.reformat(1, 2, new RecordFormat({ bold: false, font: "Times" }));
					text.reformat(2, 3, new MapFormat({ bold: false, font: "Courier" }));
					text.formatRange(0, 4, { bold: true });
					assert.deepEqual(
						text.charactersWithFormatting().map((atom) => Object.fromEntries(atom.format)),
						[
							{ bold: true, font: "Arial" },
							{ bold: true, font: "Times" },
							{ bold: true, font: "Courier" },
							{ bold: true, font: "Arial" },
						],
					);
				});

				it("clones node values independently for each atom", () => {
					const text = makeText();
					const detail = new Detail({ color: "red" });
					text.formatRange(undefined, undefined, { detail });
					const copies = text.charactersWithFormatting().map((atom) => {
						const value = Object.fromEntries(atom.format).detail;
						assert(value instanceof Detail);
						assert.notEqual(value, detail);
						return value;
					});
					assert.equal(new Set(copies).size, 4);
					copies[0].color = "blue";
					assert.deepEqual(
						copies.map((copy) => copy.color),
						["blue", "red", "red", "red"],
					);
					assert.equal(detail.color, "red");
				});

				it("rejects values not allowed by the entry schema", () => {
					const text = makeText();
					assert.throws(() =>
						// @ts-expect-error Testing invalid input.
						text.formatRange(0, 2, { bold: 42 }),
					);
					assert.deepEqual(
						text.charactersWithFormatting().map((atom) => Object.fromEntries(atom.format)),
						Array.from({ length: 4 }, () => ({ bold: false, font: "Arial" })),
					);
				});

				if (kind === "map") {
					it("accepts map entries, including deletion", () => {
						const text = makeText();
						text.formatRange(1, 3, new Map([["bold", true]]));
						text.formatRange(2, 3, new Map([["bold", undefined]]));
						assert.deepEqual(
							text.charactersWithFormatting().map((atom) => Object.fromEntries(atom.format)),
							[
								{ bold: false, font: "Arial" },
								{ bold: true, font: "Arial" },
								{ font: "Arial" },
								{ bold: false, font: "Arial" },
							],
						);
					});

					it("accepts a map node as the update", () => {
						const text = makeText();
						const format = new MapFormat({ bold: true });
						text.formatRange(1, 3, format);
						assert.deepEqual(
							text
								.charactersWithFormatting()
								.map((atom) => Object.fromEntries(atom.format).bold),
							[false, true, true, false],
						);
					});
				}
			});
		}

		it("basic use", () => {
			const text = FormattedTextTest.Tree.fromString("hello");
			text.formatRange(1, 4, { bold: true });
			assert.equal(text.fullString(), "hello");
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => [
					atom.content.content,
					atom.format.bold,
				]),
				[
					["h", false],
					["e", true],
					["l", true],
					["l", true],
					["o", false],
				],
			);
		});

		it("supports optional format fields", () => {
			const text = OptionalFormatText.fromString("abc");
			// Setting an optional field on a sub-range.
			text.formatRange(0, 2, { color: "red" });
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => atom.format.color),
				["red", "red", undefined],
			);
			// Clearing an optional field by setting it to undefined.
			text.formatRange(0, 1, { color: undefined });
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => atom.format.color),
				[undefined, "red", undefined],
			);
		});

		it("throws when an atom's format is a non-object node", () => {
			const text = UnionFormatText.fromString("b");
			// Prepend an atom whose format is a non-object (number) node.
			text.insertWithFormattingAt(0, [
				{ content: FormattedText.StringTextAtom.fromCharacter("a"), format: 5 },
			]);
			assert.throws(
				() => text.formatRange(0, 2, { bold: true }),
				validateUsageError(/formatRange encountered an existing `Leaf` format node/),
			);
		});

		it("throws when a non-object node format occurs in the middle of a range", () => {
			const text = UnionFormatText.fromString("ac");
			// Insert an atom with a non-object (number) format between the two object-formatted atoms.
			text.insertWithFormattingAt(1, [
				{ content: FormattedText.StringTextAtom.fromCharacter("b"), format: 5 },
			]);
			// The range spans object formats at either end with a non-object format in the middle.
			assert.throws(
				() => text.formatRange(0, 3, { bold: true }),
				validateUsageError(/formatRange encountered an existing `Leaf` format node/),
			);
		});

		it("throws when a leaf value is provided", () => {
			const text = UnionFormatText.fromString("a");
			assert.throws(
				() => text.formatRange(0, 1, 999),
				validateUsageError(
					"formatRange is for applying a subset of format properties: it is invalid to pass it a leaf node. Use `reformat` instead.",
				),
			);
		});
	});

	describe("reformat", () => {
		it("replaces formatting over a range", () => {
			const text = FormattedTextTest.Tree.fromString("hello");
			// Apply some formatting to the whole string first.
			text.formatRange(0, 5, { bold: true });
			// Reformat a sub-range, replacing all of its formatting.
			text.reformat(
				1,
				4,
				new FormattedTextTest.CharacterFormat({
					bold: false,
					size: 24,
					font: "Arial",
				}),
			);
			assert.equal(text.fullString(), "hello");
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => [
					atom.content.content,
					atom.format.bold,
					atom.format.size,
				]),
				[
					["h", true, 12],
					["e", false, 24],
					["l", false, 24],
					["l", false, 24],
					["o", true, 12],
				],
			);
		});

		it("applies to the whole text when the range is omitted", () => {
			const text = FormattedTextTest.Tree.fromString("abc");
			text.formatRange(0, 3, { bold: true, size: 24 });
			text.reformat(
				undefined,
				undefined,
				new FormattedTextTest.CharacterFormat({
					bold: false,
					size: 12,
					font: "Arial",
				}),
			);
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => [
					atom.format.bold,
					atom.format.size,
				]),
				[
					[false, 12],
					[false, 12],
					[false, 12],
				],
			);
		});

		it("uses the default format when no format is provided", () => {
			const text = FormattedTextTest.Tree.fromString("hello");
			text.formatRange(0, 5, { bold: true, size: 24 });
			text.reformat(1, 4);
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => [
					atom.content.content,
					atom.format.bold,
					atom.format.size,
					atom.format.font,
				]),
				[
					["h", true, 24, "Arial"],
					["e", false, 12, "Arial"],
					["l", false, 12, "Arial"],
					["l", false, 12, "Arial"],
					["o", true, 24, "Arial"],
				],
			);
		});

		it("replaces an object format with a non-object node format", () => {
			// Unlike formatRange, reformat replaces the whole format, so it supports non-object (leaf) formats.
			const text = UnionFormatText.fromString("ab");
			text.reformat(0, 2, 5);
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => atom.format),
				[5, 5],
			);
			text.reformat(0, 2, 6);
			assert.deepEqual(
				[...text.charactersWithFormatting()].map((atom) => atom.format),
				[6, 6],
			);
		});
	});

	it("insertWithFormattingAt", () => {
		const text = FormattedTextTest.Tree.fromString("ab");
		text.insertWithFormattingAt(1, [
			{
				content: FormattedText.StringTextAtom.fromCharacter("c"),
				format: {
					bold: false,
					size: 24,
					font: "Arial",
				},
			},
		]);
		assert.equal(text.fullString(), "acb");
		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => [
				atom.content.content,
				atom.format.size,
			]),
			[
				["a", 12],
				["c", 24],
				["b", 12],
			],
		);
	});

	it("insertAt applies the provided format", () => {
		const text = FormattedTextTest.Tree.fromString("ab");
		text.insertAt(2, "cd", {
			bold: true,
			size: 12,
			font: "Arial",
		});
		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => [
				atom.content.content,
				atom.format.bold,
			]),
			[
				["a", false],
				["b", false],
				["c", true],
				["d", true],
			],
		);
	});

	it("insertAt accepts text atoms", () => {
		const text = FormattedTextTest.Tree.fromString("ab");
		text.insertAt(
			1,
			[
				new FormattedTextTest.StringLineAtom({
					tag: FormattedTextTest.LineTag("h1"),
					indent: 0,
				}),
				FormattedText.StringTextAtom.fromCharacter("c"),
			],
			{
				bold: true,
				size: 12,
				font: "Arial",
			},
		);

		assert.equal(text.fullString(), "a\ncb");
		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => atom.format.bold),
			[false, true, true, false],
		);
	});

	it("getUniformRun", () => {
		const text = FormattedTextTest.Tree.fromString("abc");
		text.insertAt(3, "de", {
			bold: true,
			size: 12,
			font: "Arial",
		});
		text.insertAt(5, "f", {
			bold: true,
			size: 24,
			font: "Arial",
		});
		assert.equal(text.getUniformRun(0, 5), 3);
		assert.equal(text.getUniformRun(0), 3);
		assert.equal(text.getUniformRun(3, 5), 2);
		assert.equal(text.getUniformRun(4, 5), 1);
		assert.equal(text.getUniformRun(5, 6), 1);
		assert.throws(() => text.getUniformRun(6), UsageError);
	});

	it("getUniformRun compares optional format fields correctly", () => {
		const run = (first: { color?: string }, second: { color?: string }): number => {
			const text = OptionalFormatText.fromString("ab");
			text.formatRange(0, 1, first);
			text.formatRange(1, 2, second);
			return text.getUniformRun(0);
		};

		assert.equal(run({}, { color: "red" }), 1);
		assert.equal(run({ color: "red" }, {}), 1);
		assert.equal(run({}, {}), 2);
		assert.equal(run({ color: "red" }, { color: "red" }), 2);
		assert.equal(run({ color: "red" }, { color: "blue" }), 1);
	});

	it("getString with getUniformRun", () => {
		const text = FormattedTextTest.Tree.fromString("abc");
		text.insertAt(3, "de", {
			bold: true,
			size: 12,
			font: "Arial",
		});
		text.insertAt(5, "f", {
			bold: true,
			size: 24,
			font: "Arial",
		});
		let index = 0;
		let currentRun = text.getUniformRun(index, text.characterCount());
		assert.equal(text.getString(index, index + currentRun), "abc");
		index += currentRun;
		currentRun = text.getUniformRun(index, text.characterCount());
		assert.equal(text.getString(index, index + currentRun), "de");
		index += currentRun;
		currentRun = text.getUniformRun(index, text.characterCount());
		assert.equal(text.getString(index, index + currentRun), "f");
		assert.equal(text.getUniformRun(0), 3);
	});
	it("getString with getUniformRun on line atoms", () => {
		const text = FormattedTextTest.Tree.fromString("abcde");

		text.insertWithFormattingAt(3, [
			{
				content: new FormattedTextTest.StringLineAtom({
					tag: FormattedTextTest.LineTag("h2"),
					indent: 0,
				}),
				format: new FormattedTextTest.CharacterFormat({
					bold: false,
					size: 12,
					font: "Arial",
				}),
			},
		]);
		let index = 0;
		let currentRun = text.getUniformRun(0, text.characterCount());
		assert.equal(text.getString(index, index + currentRun), "abc");
		index += currentRun;
		currentRun = text.getUniformRun(index, text.characterCount());
		assert.equal(currentRun, 1);
		assert.equal(text.getString(index, index + currentRun), "\n");
		index += currentRun;
		currentRun = text.getUniformRun(index, text.characterCount());
		assert.equal(text.getString(index, index + currentRun), "de");
	});

	describeHydration("onContentChanged", (_init, hydrated) => {
		it("creates an insertion anchor that tracks edits", () => {
			const text = FormattedTextTest.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const anchor = text.createInsertionAnchor(1);
			try {
				text.insertAt(0, "x");
				assert.equal(anchor.index, 2);
				text.insertAt(3, "y");
				assert.equal(anchor.index, 2);
				text.removeRange(0, 1);
				assert.equal(anchor.index, 1);
			} finally {
				anchor.dispose();
			}
		});

		it("fires with insert ops when characters are added", () => {
			const text = FormattedTextTest.Tree.fromString("ab");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.insertAt(1, "xy");
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1, formattingChanged: false },
				{ type: "insert", text: "xy" },
				{ type: "retain", count: 1, formattingChanged: false },
			]);
		});

		it("fires for insert at start", () => {
			const text = FormattedTextTest.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.insertAt(0, "X");
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "insert", text: "X" },
				{ type: "retain", count: 3, formattingChanged: false },
			]);
		});

		it("fires for insert at end", () => {
			const text = FormattedTextTest.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.insertAt(3, "X");
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 3, formattingChanged: false },
				{ type: "insert", text: "X" },
			]);
		});

		it("fires with remove ops when characters are deleted", () => {
			const text = FormattedTextTest.Tree.fromString("abcde");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.removeRange(1, 3);
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1, formattingChanged: false },
				{ type: "remove", count: 2 },
				{ type: "retain", count: 2, formattingChanged: false },
			]);
		});

		it("fires for remove all", () => {
			const text = FormattedTextTest.Tree.fromString("abc");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.removeRange(0, 3);
			assert.equal(received.length, 1);
			assert.deepEqual(received[0], [{ type: "remove", count: 3 }]);
		});

		it("fires with insert and remove ops for a replace", () => {
			const text = FormattedTextTest.Tree.fromString("abcde");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.removeRange(1, 3);
			text.insertAt(1, "XY");
			// Two separate edits → two callbacks.
			assert.equal(received.length, 2);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1, formattingChanged: false },
				{ type: "remove", count: 2 },
				{ type: "retain", count: 2, formattingChanged: false },
			]);
			assert.deepEqual(received[1], [
				{ type: "retain", count: 1, formattingChanged: false },
				{ type: "insert", text: "XY" },
				{ type: "retain", count: 2, formattingChanged: false },
			]);
		});

		it("fires with formattingChanged on retain when formatting changes", () => {
			const text = FormattedTextTest.Tree.fromString("abcde");
			if (hydrated) {
				hydrateNode(text);
			}
			const received: (readonly PlainText.TextOp[])[] = [];
			text.onContentChanged((ops) => {
				assert(ops !== undefined, "expected delta ops, got undefined");
				received.push(ops);
			});
			text.formatRange(1, 3, { bold: true });

			// Both hydrated and unhydrated paths fire one event per formatted atom because
			// formatRange writes each character's format node individually.
			// formatRange(1, 3) covers indices 1 and 2, so two events fire.
			assert.equal(received.length, 2);
			assert.deepEqual(received[0], [
				{ type: "retain", count: 1, formattingChanged: false },
				{ type: "retain", count: 1, formattingChanged: true },
				{ type: "retain", count: 3, formattingChanged: false },
			]);
			assert.deepEqual(received[1], [
				{ type: "retain", count: 2, formattingChanged: false },
				{ type: "retain", count: 1, formattingChanged: true },
				{ type: "retain", count: 2, formattingChanged: false },
			]);
		});

		// Empty inserts/removes are no-ops semantically. In hydrated trees they produce no change
		// notification at all; unhydrated trees fire the callback once with no real ops (a quirk of
		// the unhydrated event path), so we only assert the hydrated behavior here.
		it("does not fire for an empty insert (hydrated)", () => {
			if (!hydrated) return;
			const text = FormattedTextTest.Tree.fromString("abc");
			hydrateNode(text);
			let callCount = 0;
			text.onContentChanged(() => {
				callCount++;
			});
			text.insertAt(1, "");
			assert.equal(callCount, 0, "empty insert should not produce a change notification");
		});

		it("does not fire for an empty remove (hydrated)", () => {
			if (!hydrated) return;
			const text = FormattedTextTest.Tree.fromString("abc");
			hydrateNode(text);
			let callCount = 0;
			text.onContentChanged(() => {
				callCount++;
			});
			text.removeRange(1, 1);
			assert.equal(callCount, 0, "empty remove should not produce a change notification");
		});

		it("cleanup function unsubscribes the callback", () => {
			const text = FormattedTextTest.Tree.fromString("ab");
			if (hydrated) {
				hydrateNode(text);
			}
			let callCount = 0;
			const cleanup = text.onContentChanged(() => {
				callCount++;
			});
			text.insertAt(1, "x");
			assert.equal(callCount, 1);
			cleanup();
			text.insertAt(1, "y");
			assert.equal(callCount, 1, "callback should not fire after cleanup");
		});
	});

	// Hydrated and unhydrated trees implement cursors differently which impacts observation tracking, so test both.
	// Specifically unhydrated tree cursors do observation tracking while hydrated ones do not.
	describeHydration("observation tracking", (init, hydrated) => {
		// Text has debug asserts which can add observations, so ensure tracking works with and without production build emulation.
		suitesWithAndWithoutProduction((emulateProduction) => {
			function setupObservations(): [FormattedTextTest.Tree, string[]] {
				const text = FormattedTextTest.Tree.fromString("hello");
				if (hydrated) {
					hydrateNode(text);
				}
				const log: string[] = [];
				TreeAlpha.trackObservationsOnce(
					() => log.push("fullString"),
					() => assert.equal(text.fullString(), "hello"),
				);
				TreeAlpha.trackObservationsOnce(
					() => log.push("characters"),
					() => assert.equal([...text.characters()].join(""), "hello"),
				);
				TreeAlpha.trackObservationsOnce(
					() => log.push("charactersCopy"),
					() => assert.equal(text.charactersCopy().join(""), "hello"),
				);
				TreeAlpha.trackObservationsOnce(
					() => log.push("characterCount"),
					() => assert.equal(text.characterCount(), 5),
				);
				for (let i = 0; i < text.characterCount(); i++) {
					const char = text.charactersWithFormatting()[i];
					const format = char.format;
					TreeAlpha.trackObservationsOnce(
						() => log.push(`bold ${i}`),
						() => assert.equal(format.bold, false),
					);
				}

				assert.deepEqual(log, []);
				return [text, log];
			}

			/**
			 * Order independent compare, asserting log has no duplicates, contains everything in expected
			 * and only has items from expected or allowExtra.
			 */
			function checkLog(log: string[], expected: string[], allowExtra: string[] = []): void {
				const logSet = new Set(log);
				assert.equal(logSet.size, log.length);

				const missing = expected.filter((item) => !logSet.has(item));
				assert.deepEqual(missing, [], `Expected log to contain ${JSON.stringify(missing)}`);

				const allowedSet = new Set([...allowExtra, ...expected]);
				const extra = log.filter((item) => !allowedSet.has(item));
				assert.deepEqual(extra, [], `Expected log to not contain ${JSON.stringify(extra)}`);
			}
			it("removeRange", () => {
				const [text, log] = setupObservations();
				text.removeRange(2, 3);
				checkLog(log, ["fullString", "characters", "charactersCopy", "characterCount"]);
			});
			it("insertAt", () => {
				const [text, log] = setupObservations();
				text.insertAt(2, "X");
				checkLog(log, ["fullString", "characters", "charactersCopy", "characterCount"]);
			});

			// Allow over invalidation of these due to these using cursors and non-precise invalidation tracking.
			const overInvalidated = ["fullString", "characters", "charactersCopy", "characterCount"];

			it("formatRange", () => {
				const [text, log] = setupObservations();
				text.formatRange(2, 3, { bold: true });
				checkLog(log, ["bold 2"], overInvalidated);
			});

			// This test, in production mode, with hydrated nodes serves as a regression test for a bug where
			// the use of cursors for optimization broke observation tracking.
			// This issue only occurred with hydrated nodes as unhydrated cursors do observation tracking.
			// This issue only occurred for production mode due to the debugAsserts observing nodes through the high level APIs.
			it("edit character text", () => {
				const [text, log] = setupObservations();
				const char = text.charactersWithFormatting()[2].content;
				assert(char instanceof StringTextAtomNode);
				char.content = "X";
				checkLog(log, ["fullString", "characters", "charactersCopy"], overInvalidated);
			});

			it("edit character format", () => {
				const [text, log] = setupObservations();
				const char = text.charactersWithFormatting()[2];
				char.format.bold = true;
				checkLog(log, ["bold 2"], overInvalidated);
			});
		});
	});
});
