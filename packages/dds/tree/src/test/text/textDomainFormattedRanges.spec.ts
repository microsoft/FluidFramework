/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ExtrinsicLocations } from "../../extrinsic-locations/index.js";

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import {
	allowUnused,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	type NodeFromSchema,
	type TreeViewAlpha,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { FormattedText } from "../../text/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";
import { createTestUndoRedoStacks, TestTreeProviderLite } from "../utils.js";

const sf = new SchemaFactoryBeta("test.formatted.ranges");
class Format extends sf.object("Format", { bold: sf.boolean }) {}
class Comment extends sf.object("Comment", { message: sf.string }) {}
class Embedded extends sf.object("Embedded", { label: sf.string }) {
	public get content(): string {
		return `[${this.label}]`;
	}
}
class Text extends FormattedText.createSchemaWithRanges(
	sf,
	Format,
	[Embedded],
	{ bold: false },
	Comment,
) {}
class LegacyText extends FormattedText.createSchema(sf, Format, [Embedded], { bold: false }) {}
const config = new TreeViewConfiguration({ schema: Text, enableSchemaValidation: true });
const legacyConfig = new TreeViewConfiguration({
	schema: LegacyText,
	enableSchemaValidation: true,
});

function endpoints(text: Text, key: string): [number, number] {
	const { start, end } = rangeBounds(text.ranges, key);
	return [start, end];
}

function setup(): { provider: TestTreeProviderLite; view: TreeViewAlpha<typeof Text> } {
	const provider = new TestTreeProviderLite(
		2,
		configuredSharedTree({ minVersionForCollab: FluidClientVersion.v2_80 }).getFactory(),
	);
	const view = asAlpha(provider.trees[0].viewWith(config));
	view.initialize(Text.fromString("abcdef"));
	provider.synchronizeMessages();
	return { provider, view };
}

function snapshot(text: Text): object {
	return {
		text: text.fullString(),
		ranges: [...text.ranges.keys()]
			.sort()
			.map((key) => [key, ...endpoints(text, key), text.ranges.getRange(key)?.data.message]),
	};
}

function rangeBounds(
	ranges: Pick<ExtrinsicLocations.RangeCollection<unknown>, "getRange">,
	key: string,
): ExtrinsicLocations.RangeEndpoints {
	const range = ranges.getRange(key);
	assert(range !== undefined);
	return { start: range.start.index, end: range.end.index };
}

describe("FormattedText with extrinsic ranges", () => {
	describeHydration("text and ranges", (_init, hydrated) => {
		function create(value: string = "abcdef"): Text {
			const text = Text.fromString(value);
			if (hydrated) {
				hydrateNode(text);
			}
			return text;
		}

		it("replaces range data through retained handles without changing endpoints", () => {
			const text = create();
			const range = text.ranges.trackNewRange(
				"range",
				{ start: 1, end: 4 },
				{ message: "original" },
			);
			const other = text.ranges.getRange("range");
			assert(other !== undefined);
			const { start, end } = range;
			range.data = { message: "replacement" };
			assert(range.data instanceof Comment);
			assert.equal(other.data, range.data);
			assert.equal(other.data.message, "replacement");
			range.data = new Comment({ message: "replacement node" });
			assert.equal(other.data.message, "replacement node");
			assert.equal(range.start, start);
			assert.equal(range.end, end);
			assert.deepEqual([start.index, end.index], [1, 4]);
			text.insertAt(0, "X");
			assert.deepEqual([start.index, end.index], [2, 5]);
			assert.equal(other.data.message, "replacement node");
			assert.throws(() => {
				// @ts-expect-error Invalid replacement data must also be rejected at runtime.
				range.data = { message: 0 };
			});
			assert.equal(other.data.message, "replacement node");
			assert.deepEqual([start.index, end.index], [2, 5]);
		});

		it("@Smoke tracks all structural text editing methods", () => {
			const text = create();
			const range = text.ranges.trackNewRange(
				"range",
				{ start: 1, end: 4 },
				{ message: "comment" },
			);
			text.insertAt(0, "X");
			assert.deepEqual(endpoints(text, "range"), [2, 5]);
			text.insertWithFormattingAt(2, [
				{ content: FormattedText.StringTextAtom.fromCharacter("Y"), format: { bold: true } },
			]);
			assert.equal(text.fullString(), "XaYbcdef");
			assert.deepEqual(endpoints(text, "range"), [3, 6]);
			assert.equal(text.charactersWithFormatting()[2]?.format.bold, true);
			text.removeRange(3, 6);
			assert.deepEqual(endpoints(text, "range"), [3, 3]);
			text.moveRangeToIndex(0, 3, 4);
			assert.equal(text.fullString(), "eXaYf");
			assert.deepEqual(endpoints(text, "range"), [4, 4]);
			text.removeRange(undefined, undefined);
			assert.deepEqual(endpoints(text, "range"), [0, 0]);
			assert.equal(text.ranges.getRange("range")?.data, range.data);
		});

		for (const [index, expected] of [
			[0, [2, 4]],
			[1, [2, 4]],
			[2, [1, 4]],
			[3, [1, 4]],
			[4, [1, 3]],
			[6, [1, 3]],
		] as const) {
			it(`tracks insertion at atom index ${index}`, () => {
				const text = create();
				text.ranges.trackNewRange("range", { start: 1, end: 3 }, { message: "range" });
				text.insertAt(index, "X");
				assert.deepEqual(endpoints(text, "range"), expected);
			});
		}

		it("keeps ranges with the text rather than following moved atoms", () => {
			const text = create();
			text.ranges.trackNewRange("range", { start: 1, end: 3 }, { message: "range" });
			text.moveRangeToIndex(0, 5, 6);
			assert.deepEqual(endpoints(text, "range"), [2, 4]);
			assert.equal(text.getString(...endpoints(text, "range")), "bc");
			text.moveRangeToIndex(6, 2, 4);
			assert.equal(text.fullString(), "fadebc");
			assert.deepEqual(endpoints(text, "range"), [2, 2]);
		});

		it("counts Unicode code points and embedded objects as atoms", () => {
			const text = create("a\u{1F600}b");
			text.ranges.trackNewRange("range", { start: 1, end: 2 }, { message: "emoji" });
			text.insertAt(1, [new Embedded({ label: "object" })]);
			assert.equal(text.fullString(), "a[object]\u{1F600}b");
			assert.equal(text.characterCount(), 4);
			assert.deepEqual(endpoints(text, "range"), [2, 3]);
			assert.equal(text.getString(...endpoints(text, "range")), "\u{1F600}");
		});

		it("preserves endpoints through both formatting APIs", () => {
			const text = create();
			const range = text.ranges.trackNewRange(
				"range",
				{ start: 1, end: 4 },
				{ message: "range" },
			);
			text.formatRange(0, 3, { bold: true });
			assert.equal(text.charactersWithFormatting()[1]?.format.bold, true);
			text.reformat(1, 2);
			assert.equal(text.charactersWithFormatting()[1]?.format.bold, false);
			assert.deepEqual(endpoints(text, "range"), [1, 4]);
			assert.equal(text.ranges.getRange("range")?.data, range.data);
		});

		it("sets and removes ranges by key while preserving editable data", () => {
			const text = create();
			const first = text.ranges.trackNewRange(
				"first",
				{ start: 1, end: 3 },
				{ message: "same" },
			);
			const captured = text.ranges;
			const second = text.ranges.trackNewRange(
				"second",
				{ start: 1, end: 3 },
				{ message: "same" },
			);
			assert.equal(captured, text.ranges);
			assert.equal(captured.getRange("first")?.data, first.data);
			assert.equal(captured.getRange("second")?.data, second.data);
			first.data.message = "updated";
			text.ranges.setRangeBounds("first", { start: 0, end: 6 });
			assert.deepEqual(endpoints(text, "first"), [0, 6]);
			assert.deepEqual(endpoints(text, "second"), [1, 3]);
			assert.equal(first.data.message, "updated");
			text.ranges.removeTrackedRange("first");
			assert.deepEqual([...captured.keys()], ["second"]);
			assert.equal(captured.getRange("second")?.data, second.data);
			assert.equal(text.ranges.getRange("first"), undefined);
			assert.throws(
				() => text.ranges.setRangeBounds("first", { start: 0, end: 1 }),
				validateUsageError(/not tracked/),
			);
			assert.throws(
				() => text.ranges.removeTrackedRange("first"),
				validateUsageError(/not tracked/),
			);
		});

		it("keeps the collection live without eagerly creating range storage", () => {
			const text = create();
			const initial = JSON.stringify(text);
			const ranges = text.ranges;
			assert.equal([...ranges.keys()].length, 0);
			assert.deepEqual([...ranges.keys()], []);
			assert.equal(ranges.getRange("missing"), undefined);
			assert.equal(ranges.getRange("missing") !== undefined, false);
			assert.equal(JSON.stringify(text), initial);
			const expected = new Map(
				["review/42", "", "__proto__", "constructor"].map((key) => [
					key,
					text.ranges.trackNewRange(key, { start: 0, end: 1 }, { message: key }),
				]),
			);
			assert.equal(text.ranges, ranges);
			assert.equal([...ranges.keys()].length, 4);
			assert.deepEqual([...ranges.keys()].sort(), [...expected.keys()].sort());
			for (const [key, range] of expected) {
				assert.equal(ranges.getRange(key)?.data, range.data);
				assert.deepEqual([range.start.index, range.end.index], [0, 1]);
			}
			text.ranges.removeTrackedRange("");
			assert.equal([...ranges.keys()].length, 3);
			assert.equal(ranges.getRange("") !== undefined, false);
			assert.equal(ranges.getRange(""), undefined);
		});

		it("rejects duplicate keys without replacing data and can reuse a removed key", () => {
			const text = create();
			const original = text.ranges.trackNewRange(
				"review",
				{ start: 1, end: 3 },
				{ message: "original" },
			);
			const initial = JSON.stringify(text);
			assert.throws(
				() =>
					text.ranges.trackNewRange(
						"review",
						{ start: 0, end: 1 },
						{ message: "replacement" },
					),
				validateUsageError(/already tracked/),
			);
			assert.equal(JSON.stringify(text), initial);
			assert.equal(text.ranges.getRange("review")?.data, original.data);
			assert.deepEqual(rangeBounds(text.ranges, "review"), { start: 1, end: 3 });
			text.ranges.removeTrackedRange("review");
			const replacement = text.ranges.trackNewRange(
				"review",
				{ start: 0, end: 2 },
				{ message: "replacement" },
			);
			assert.notEqual(replacement, original);
			text.insertAt(0, "X");
			assert.deepEqual(rangeBounds(text.ranges, "review"), { start: 1, end: 3 });
			assert.equal(text.ranges.getRange("review")?.data, replacement.data);
		});

		it("does not create range storage on reads, formatting, or invalid range operations", () => {
			const text = create();
			const initial = JSON.stringify(text);
			assert.equal(initial.includes('"rangeStorage"'), false);
			assert.equal([...text.ranges.keys()].length, 0);
			const other = create();
			other.ranges.trackNewRange("foreign", { start: 0, end: 1 }, { message: "foreign" });
			for (const key of ["foreign", "missing"]) {
				assert.equal(text.ranges.getRange(key), undefined);
				assert.throws(
					() => text.ranges.setRangeBounds(key, { start: 0, end: 1 }),
					validateUsageError(/not tracked/),
				);
				assert.throws(
					() => text.ranges.removeTrackedRange(key),
					validateUsageError(/not tracked/),
				);
			}
			for (const [start, end] of [
				[-1, 1],
				[0, 7],
				[3, 2],
				[0.5, 1],
				[0, Number.NaN],
			]) {
				assert.throws(
					() => text.ranges.trackNewRange("invalid", { start, end }, { message: "invalid" }),
					UsageError,
				);
			}
			assert.equal(JSON.stringify(text), initial);
			text.formatRange(0, 1, { bold: true });
			text.reformat(0, 1);
			assert.equal(JSON.stringify(text), initial);
		});

		it("rejects invalid text positions before initializing range storage", () => {
			const text = create();
			const initial = JSON.stringify(text);
			assert.throws(() => text.insertAt(-1, "X"), UsageError);
			assert.throws(() => text.insertWithFormattingAt(7, []), UsageError);
			assert.throws(() => text.removeRange(3, 1), UsageError);
			assert.throws(() => text.moveRangeToIndex(7, 1, 2), UsageError);
			assert.throws(() => text.moveRangeToIndex(0, 1, 7), UsageError);
			assert.equal(JSON.stringify(text), initial);
			text.insertAt(0, "X");
			assert.equal(text.fullString(), "Xabcdef");
		});

		it("rejects range mutations during an input iterator while allowing reads and data edits", () => {
			const text = create();
			const range = text.ranges.trackNewRange(
				"range",
				{ start: 1, end: 4 },
				{ message: "original" },
			);
			const input = {
				*[Symbol.iterator](): IterableIterator<FormattedText.StringTextAtom> {
					assert.throws(
						() =>
							text.ranges.trackNewRange("added", { start: 0, end: 2 }, { message: "added" }),
						validateUsageError(/while editing content/),
					);
					assert.throws(
						() => text.ranges.setRangeBounds("range", { start: 0, end: 2 }),
						validateUsageError(/while editing content/),
					);
					assert.throws(
						() => text.ranges.removeTrackedRange("range"),
						validateUsageError(/while editing content/),
					);
					assert.deepEqual([...text.ranges.keys()], ["range"]);
					assert.deepEqual([range.start.index, range.end.index], [1, 4]);
					range.data = { message: "replacement" };
					range.data.message = "updated";
					yield FormattedText.StringTextAtom.fromCharacter("X");
				},
			};
			text.insertAt(0, input);
			assert.equal(text.fullString(), "Xabcdef");
			assert.deepEqual([range.start.index, range.end.index], [2, 5]);
			assert.equal(range.data.message, "updated");
			text.ranges.setRangeBounds("range", { start: 0, end: 2 });
			text.ranges.removeTrackedRange("range");
			text.ranges.trackNewRange("added", { start: 0, end: 1 }, { message: "added" });
			assert.deepEqual(endpoints(text, "added"), [0, 1]);
		});

		it("delivers invalidation events synchronously, including during an input iterator", () => {
			const text = create();
			text.ranges.trackNewRange("range", { start: 1, end: 4 }, { message: "range" });
			let cached = text.fullString();
			let events = 0;
			const off = text.onContentChanged(() => {
				events++;
				cached = text.fullString();
			});
			const input = {
				*[Symbol.iterator](): IterableIterator<FormattedText.StringTextAtom> {
					text.formatRange(0, 1, { bold: true });
					assert.equal(events, 1);
					assert.equal(cached, text.fullString());
					yield FormattedText.StringTextAtom.fromCharacter("X");
				},
			};
			text.insertAt(0, input);
			assert.equal(events, 2);
			assert.equal(cached, "Xabcdef");
			assert.deepEqual(endpoints(text, "range"), [2, 5]);
			off();
		});
	});

	it("supports recursive range data and preserves the legacy public API", () => {
		const recursiveFactory = new SchemaFactoryBeta("test.formatted.recursiveRanges");
		class RecursiveComment extends recursiveFactory.objectRecursive("Comment", {
			text: recursiveFactory.optionalRecursive([() => RecursiveText]),
		}) {}
		type _check = ValidateRecursiveSchema<typeof RecursiveComment>;
		class RecursiveText extends FormattedText.createSchemaWithRanges(
			recursiveFactory,
			recursiveFactory.null,
			[],
			null,
			RecursiveComment,
		) {}
		const text = RecursiveText.fromString("outer");
		const range = text.ranges.trackNewRange(
			"range",
			{ start: 0, end: 5 },
			new RecursiveComment({ text: RecursiveText.fromString("inner") }),
		);
		assert.equal(range.data.text?.fullString(), "inner");
		const check = (
			tracked: NodeFromSchema<typeof Text>,
			legacy: NodeFromSchema<typeof LegacyText>,
		): void => {
			const handle = tracked.ranges.trackNewRange(
				"handle",
				{ start: 0, end: 0 },
				{ message: "typed" },
			);
			const message: string = handle.data.message;
			const bold: boolean | undefined = tracked.charactersWithFormatting()[0]?.format.bold;
			allowUnused(message);
			allowUnused(bold);
			// @ts-expect-error Legacy text does not expose range methods.
			allowUnused(legacy.trackNewRange);
			// @ts-expect-error Legacy text does not expose range storage.
			allowUnused(legacy.ranges);
			const start: number = handle.start.index;
			allowUnused(start);
			// @ts-expect-error Endpoints must be changed through the collection.
			handle.start = 1;
			handle.data = { message: "replacement" };
			handle.data = new Comment({ message: "replacement node" });
			// @ts-expect-error Endpoint indexes cannot be assigned.
			handle.end.index = 1;
			// @ts-expect-error Replacement data retains its schema.
			handle.data = { message: 42 };
			// @ts-expect-error Range data retains its schema.
			tracked.ranges.trackNewRange("not a comment", { start: 0, end: 0 }, "not a comment");
			// @ts-expect-error Formatting retains its schema.
			tracked.insertAt(0, "x", { bold: 1 });
			// @ts-expect-error Range membership cannot be edited directly.
			allowUnused(tracked.ranges.set);
			// @ts-expect-error Range removal must go through the text's method.
			allowUnused(tracked.ranges.delete);
			// @ts-expect-error Range operations use keys, not handles.
			tracked.ranges.getRange(handle);
			// @ts-expect-error Keys must be strings.
			tracked.ranges.trackNewRange(42, { start: 0, end: 0 }, { message: "invalid" });
		};
		allowUnused(check);
		assert(Text.fromString("") instanceof Text);
	});

	it("upgrades existing text without rewriting its content and excludes old writers", () => {
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({ minVersionForCollab: FluidClientVersion.v2_80 }).getFactory(),
		);
		const legacy = provider.trees[0].viewWith(legacyConfig);
		legacy.initialize(LegacyText.fromString("a\u{1F600}b"));
		legacy.root.insertAt(1, [new Embedded({ label: "object" })]);
		legacy.root.formatRange(1, 3, { bold: true });
		const legacyRoot = legacy.root;
		const initial = JSON.stringify(legacy.root);
		let contentEvents = 0;
		const off = legacy.root.onContentChanged(() => contentEvents++);
		provider.synchronizeMessages();
		const upgraded = provider.trees[1].viewWith(config);
		assert.equal(Text.identifier, LegacyText.identifier);
		assert.equal(upgraded.compatibility.canView, false);
		assert.equal(upgraded.compatibility.canUpgrade, true);
		assert.equal(upgraded.compatibility.isEquivalent, false);
		upgraded.upgradeSchema();
		assert.equal(JSON.stringify(upgraded.root), initial);
		assert.equal(upgraded.root.fullString(), "a[object]\u{1F600}b");
		assert.equal(upgraded.root.charactersWithFormatting()[1]?.format.bold, true);
		assert.equal([...upgraded.root.ranges.keys()].length, 0);
		assert.equal(JSON.stringify(upgraded.root), initial);
		provider.synchronizeMessages();
		assert.equal(contentEvents, 0);
		assert.equal(legacy.compatibility.canView, false);
		upgraded.root.ranges.trackNewRange("range", { start: 1, end: 3 }, { message: "migrated" });
		upgraded.root.insertAt(0, "X");
		assert.deepEqual(endpoints(upgraded.root, "range"), [2, 4]);
		provider.synchronizeMessages();
		off();
		assert.throws(() => legacyRoot.insertAt(0, "not allowed"));
	});

	describe("collaboration and reverting lazy storage", () => {
		const edits = {
			insert: (text: Text): void => text.insertAt(0, "X"),
			formattedInsert: (text: Text): void =>
				text.insertWithFormattingAt(0, [
					{ content: FormattedText.StringTextAtom.fromCharacter("X"), format: { bold: true } },
				]),
			remove: (text: Text): void => text.removeRange(0, 2),
			move: (text: Text): void => text.moveRangeToIndex(0, 4, 6),
		};

		for (const [name, edit] of Object.entries(edits)) {
			for (const editFirst of [true, false]) {
				it(`resolves ${name} racing the first range, edit first: ${editFirst}`, () => {
					const { provider, view } = setup();
					const other = provider.trees[1].viewWith(config);
					let expected: object;
					if (editFirst) {
						edit(view.root);
						expected = snapshot(view.root);
						other.root.ranges.trackNewRange(
							"first",
							{ start: 1, end: 4 },
							{ message: "first" },
						);
					} else {
						other.root.ranges.trackNewRange(
							"first",
							{ start: 1, end: 4 },
							{ message: "first" },
						);
						expected = snapshot(other.root);
						edit(view.root);
					}
					provider.synchronizeMessages();
					assert.deepEqual(snapshot(view.root), expected);
					assert.deepEqual(snapshot(other.root), expected);
					view.root.ranges.trackNewRange(
						"range",
						{ start: 0, end: 1 },
						{ message: "after rebase" },
					);
					view.root.insertAt(0, "Y");
					assert.deepEqual(endpoints(view.root, "range"), [1, 2]);
					provider.synchronizeMessages();
					assert.deepEqual(snapshot(other.root), snapshot(view.root));
				});
			}
		}

		it("rejects the second simultaneous initialization rather than losing either edit's endpoints", () => {
			const { provider, view } = setup();
			const other = provider.trees[1].viewWith(config);
			view.root.insertAt(0, "X");
			other.root.insertAt(0, "Y");
			provider.synchronizeMessages();
			assert.equal(view.root.fullString(), "Xabcdef");
			assert.deepEqual(snapshot(other.root), snapshot(view.root));
			other.root.ranges.trackNewRange(
				"range",
				{ start: 1, end: 4 },
				{ message: "winner's storage" },
			);
			other.root.insertAt(0, "Z");
			assert.deepEqual(endpoints(other.root, "range"), [2, 5]);
			provider.synchronizeMessages();
			assert.deepEqual(snapshot(other.root), snapshot(view.root));
		});

		for (const sameKey of [true, false]) {
			it(`rejects concurrent first-range creation atomically, same key: ${sameKey}`, () => {
				const { provider, view } = setup();
				const other = provider.trees[1].viewWith(config);
				const ranges = other.root.ranges;
				view.root.ranges.trackNewRange("review", { start: 1, end: 3 }, { message: "first" });
				const rejected = ranges.trackNewRange(
					sameKey ? "review" : "other",
					{ start: 0, end: 2 },
					{ message: "second" },
				);
				provider.synchronizeMessages();
				assert.deepEqual(snapshot(view.root), {
					text: "abcdef",
					ranges: [["review", 1, 3, "first"]],
				});
				assert.deepEqual(snapshot(other.root), snapshot(view.root));
				assert.equal(ranges.getRange("review")?.data.message, "first");
				assert.equal([...ranges.keys()].length, 1);
				assert.equal(ranges.getRange("other") !== undefined, false);
				assert.throws(() => rejected.start.index, validateUsageError(/no longer tracked/));
				assert.throws(() => rejected.end.index, validateUsageError(/no longer tracked/));
				other.root.ranges.trackNewRange(
					"retry",
					{ start: 0, end: 1 },
					{ message: "after rejection" },
				);
				other.root.insertAt(0, "X");
				assert.deepEqual(rangeBounds(other.root.ranges, "retry"), { start: 1, end: 2 });
				provider.synchronizeMessages();
				assert.deepEqual(snapshot(other.root), snapshot(view.root));
			});
		}

		it("replicates tracked edits and range updates sequentially", () => {
			const { provider, view } = setup();
			view.root.ranges.trackNewRange("range", { start: 1, end: 4 }, { message: "range" });
			provider.synchronizeMessages();
			const other = provider.trees[1].viewWith(config);
			view.root.insertAt(0, "X");
			provider.synchronizeMessages();
			assert.deepEqual(snapshot(other.root), {
				text: "Xabcdef",
				ranges: [["range", 2, 5, "range"]],
			});
			other.root.removeRange(1, 4);
			provider.synchronizeMessages();
			assert.deepEqual(snapshot(view.root), {
				text: "Xdef",
				ranges: [["range", 1, 2, "range"]],
			});
		});

		it("merges data replacement with concurrent text edits", () => {
			const { provider, view } = setup();
			view.root.ranges.trackNewRange("range", { start: 1, end: 4 }, { message: "original" });
			provider.synchronizeMessages();
			const fork = view.fork();
			const range = fork.root.ranges.getRange("range");
			assert(range !== undefined);
			range.data = { message: "replacement" };
			view.root.insertAt(0, "X");
			provider.synchronizeMessages();
			fork.rebaseOnto(view);
			assert.equal(range.data.message, "replacement");
			assert.deepEqual([range.start.index, range.end.index], [2, 5]);
			view.merge(fork);
			provider.synchronizeMessages();
			const other = provider.trees[1].viewWith(config);
			assert.deepEqual(snapshot(other.root), {
				text: "Xabcdef",
				ranges: [["range", 2, 5, "replacement"]],
			});
		});

		for (const [name, edit] of Object.entries({
			firstContentEdit: edits.insert,
			firstRange: (text: Text): void => {
				text.ranges.trackNewRange("range", { start: 1, end: 4 }, { message: "range" });
			},
		})) {
			it(`undoes and redoes ${name} including storage initialization`, () => {
				const { provider, view } = setup();
				const initial = JSON.stringify(view.root);
				const ranges = view.root.ranges;
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				edit(view.root);
				const handle = ranges.getRange("range");
				const edited = JSON.stringify(view.root);
				provider.synchronizeMessages();
				const undo = undoStack.pop();
				assert(undo !== undefined);
				undo.revert();
				assert.equal(JSON.stringify(view.root), initial);
				assert.equal([...ranges.keys()].length, 0);
				if (handle !== undefined) {
					assert.throws(() => handle.start.index, validateUsageError(/no longer tracked/));
				}
				const redo = redoStack.pop();
				assert(redo !== undefined);
				redo.revert();
				assert.equal(JSON.stringify(view.root), edited);
				assert.equal(ranges, view.root.ranges);
				assert.deepEqual([...ranges.keys()], [...view.root.ranges.keys()]);
				if (handle !== undefined) {
					assert.deepEqual([handle.start.index, handle.end.index], [1, 4]);
				}
				view.root.ranges.trackNewRange(
					"after-redo",
					{ start: 0, end: 1 },
					{ message: "after redo" },
				);
				view.root.insertAt(0, "Y");
				assert.deepEqual(endpoints(view.root, "after-redo"), [1, 2]);
				unsubscribe();
			});

			it(`reuses the tracker after undoing ${name} and editing again`, () => {
				const { provider, view } = setup();
				const ranges = view.root.ranges;
				const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				edit(view.root);
				provider.synchronizeMessages();
				const undo = undoStack.pop();
				assert(undo !== undefined);
				undo.revert();
				ranges.trackNewRange("range", { start: 1, end: 4 }, { message: "replacement" });
				assert.equal(ranges, view.root.ranges);
				view.root.insertAt(0, "X");
				assert.deepEqual(endpoints(view.root, "range"), [2, 5]);
				unsubscribe();
			});
		}

		it("rolls back initialization with the outer transaction and can edit afterward", () => {
			const { view } = setup();
			const initial = JSON.stringify(view.root);
			const ranges = view.root.ranges;
			const result = view.runTransaction(() => {
				view.root.ranges.trackNewRange(
					"temporary",
					{ start: 1, end: 4 },
					{ message: "temporary" },
				);
				assert.equal(ranges.getRange("temporary") !== undefined, true);
				view.root.insertAt(0, "X");
				assert.deepEqual(endpoints(view.root, "temporary"), [2, 5]);
				return { rollback: true };
			});
			assert.equal(result.success, false);
			assert.equal(JSON.stringify(view.root), initial);
			assert.equal([...ranges.keys()].length, 0);
			view.root.ranges.trackNewRange(
				"range",
				{ start: 1, end: 4 },
				{ message: "replacement" },
			);
			assert.equal(ranges.getRange("range")?.data.message, "replacement");
			view.root.insertAt(0, "Y");
			assert.deepEqual(endpoints(view.root, "range"), [2, 5]);
		});

		it("rejects undoing initial storage creation after an intervening range edit", () => {
			const { provider, view } = setup();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			view.root.insertAt(0, "X");
			const undo = undoStack.pop();
			assert(undo !== undefined);
			view.root.ranges.trackNewRange("keep", { start: 1, end: 4 }, { message: "keep" });
			provider.synchronizeMessages();
			undo.revert();
			assert.deepEqual(snapshot(view.root), {
				text: "Xabcdef",
				ranges: [["keep", 1, 4, "keep"]],
			});
			unsubscribe();
		});
	});
});
