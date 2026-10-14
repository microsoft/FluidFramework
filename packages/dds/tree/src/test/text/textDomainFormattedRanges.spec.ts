/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import type { ArrayWithExtrinsicRanges } from "../../extrinsic-locations/index.js";
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

function endpoints(
	text: Text,
	range: ArrayWithExtrinsicRanges.Range<typeof Comment>,
): [number, number] {
	const { start, end } = text.getExtrinsicRange(range);
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
		ranges: text.ranges.map((range) => [...endpoints(text, range), range.data.message]),
	};
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

		it("@Smoke tracks all structural text editing methods", () => {
			const text = create();
			const range = text.addExtrinsicRange(1, 4, { message: "comment" });
			text.insertAt(0, "X");
			assert.deepEqual(endpoints(text, range), [2, 5]);
			text.insertWithFormattingAt(2, [
				{ content: FormattedText.StringTextAtom.fromCharacter("Y"), format: { bold: true } },
			]);
			assert.equal(text.fullString(), "XaYbcdef");
			assert.deepEqual(endpoints(text, range), [3, 6]);
			assert.equal(text.charactersWithFormatting()[2]?.format.bold, true);
			text.removeRange(3, 6);
			assert.deepEqual(endpoints(text, range), [3, 3]);
			text.moveRangeToIndex(0, 3, 4);
			assert.equal(text.fullString(), "eXaYf");
			assert.deepEqual(endpoints(text, range), [4, 4]);
			text.removeRange(undefined, undefined);
			assert.deepEqual(endpoints(text, range), [0, 0]);
			assert.equal(text.ranges[0], range);
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
				const range = text.addExtrinsicRange(1, 3, { message: "range" });
				text.insertAt(index, "X");
				assert.deepEqual(endpoints(text, range), expected);
			});
		}

		it("keeps ranges with the text rather than following moved atoms", () => {
			const text = create();
			const range = text.addExtrinsicRange(1, 3, { message: "range" });
			text.moveRangeToIndex(0, 5, 6);
			assert.deepEqual(endpoints(text, range), [2, 4]);
			assert.equal(text.getString(...endpoints(text, range)), "bc");
			text.moveRangeToIndex(6, 2, 4);
			assert.equal(text.fullString(), "fadebc");
			assert.deepEqual(endpoints(text, range), [2, 2]);
		});

		it("counts Unicode code points and embedded objects as atoms", () => {
			const text = create("a\u{1F600}b");
			const range = text.addExtrinsicRange(1, 2, { message: "emoji" });
			text.insertAt(1, [new Embedded({ label: "object" })]);
			assert.equal(text.fullString(), "a[object]\u{1F600}b");
			assert.equal(text.characterCount(), 4);
			assert.deepEqual(endpoints(text, range), [2, 3]);
			assert.equal(text.getString(...endpoints(text, range)), "\u{1F600}");
		});

		it("preserves endpoints through both formatting APIs", () => {
			const text = create();
			const range = text.addExtrinsicRange(1, 4, { message: "range" });
			text.formatRange(0, 3, { bold: true });
			assert.equal(text.charactersWithFormatting()[1]?.format.bold, true);
			text.reformat(1, 2);
			assert.equal(text.charactersWithFormatting()[1]?.format.bold, false);
			assert.deepEqual(endpoints(text, range), [1, 4]);
			assert.equal(text.ranges[0], range);
		});

		it("sets and removes ranges by identity while preserving editable data", () => {
			const text = create();
			const first = text.addExtrinsicRange(1, 3, { message: "same" });
			const captured = text.ranges;
			const second = text.addExtrinsicRange(1, 3, { message: "same" });
			assert.deepEqual(captured, [first]);
			first.data.message = "updated";
			text.setExtrinsicRange(first, 0, 6);
			assert.deepEqual(endpoints(text, first), [0, 6]);
			assert.deepEqual(endpoints(text, second), [1, 3]);
			assert.equal(first.data.message, "updated");
			text.removeExtrinsicRange(first);
			assert.deepEqual(text.ranges, [second]);
			assert.throws(
				() => text.getExtrinsicRange(first),
				validateUsageError(/does not belong/),
			);
			assert.throws(
				() => text.setExtrinsicRange(first, 0, 1),
				validateUsageError(/does not belong/),
			);
			assert.throws(
				() => text.removeExtrinsicRange(first),
				validateUsageError(/does not belong/),
			);
		});

		it("does not create range storage on reads, formatting, or invalid range operations", () => {
			const text = create();
			const initial = JSON.stringify(text);
			assert.equal(initial.includes('"rangeStorage"'), false);
			assert.deepEqual(text.ranges, []);
			const other = create();
			const foreign = other.addExtrinsicRange(0, 1, { message: "foreign" });
			for (const range of [foreign, { data: new Comment({ message: "fabricated" }) }]) {
				assert.throws(
					() => text.getExtrinsicRange(range),
					validateUsageError(/does not belong/),
				);
				assert.throws(
					() => text.setExtrinsicRange(range, 0, 1),
					validateUsageError(/does not belong/),
				);
				assert.throws(
					() => text.removeExtrinsicRange(range),
					validateUsageError(/does not belong/),
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
					() => text.addExtrinsicRange(start, end, { message: "invalid" }),
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

		it("delivers invalidation events synchronously, including during an input iterator", () => {
			const text = create();
			const range = text.addExtrinsicRange(1, 4, { message: "range" });
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
			assert.deepEqual(endpoints(text, range), [2, 5]);
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
		const range = text.addExtrinsicRange(
			0,
			5,
			new RecursiveComment({ text: RecursiveText.fromString("inner") }),
		);
		assert.equal(range.data.text?.fullString(), "inner");
		const check = (
			tracked: NodeFromSchema<typeof Text>,
			legacy: NodeFromSchema<typeof LegacyText>,
		): void => {
			const handle = tracked.addExtrinsicRange(0, 0, { message: "typed" });
			const message: string = handle.data.message;
			const bold: boolean | undefined = tracked.charactersWithFormatting()[0]?.format.bold;
			allowUnused(message);
			allowUnused(bold);
			// @ts-expect-error Legacy text does not expose range methods.
			allowUnused(legacy.addExtrinsicRange);
			// @ts-expect-error Legacy text does not expose range storage.
			allowUnused(legacy.ranges);
			// @ts-expect-error Endpoints are only available through the text's methods.
			allowUnused(handle.start);
			// @ts-expect-error Range data retains its schema.
			tracked.addExtrinsicRange(0, 0, "not a comment");
			// @ts-expect-error Formatting retains its schema.
			tracked.insertAt(0, "x", { bold: 1 });
			// @ts-expect-error Range membership cannot be edited directly.
			allowUnused(tracked.ranges.push);
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
		assert.deepEqual(upgraded.root.ranges, []);
		assert.equal(JSON.stringify(upgraded.root), initial);
		provider.synchronizeMessages();
		assert.equal(contentEvents, 0);
		assert.equal(legacy.compatibility.canView, false);
		const range = upgraded.root.addExtrinsicRange(1, 3, { message: "migrated" });
		upgraded.root.insertAt(0, "X");
		assert.deepEqual(endpoints(upgraded.root, range), [2, 4]);
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
						other.root.addExtrinsicRange(1, 4, { message: "first" });
					} else {
						other.root.addExtrinsicRange(1, 4, { message: "first" });
						expected = snapshot(other.root);
						edit(view.root);
					}
					provider.synchronizeMessages();
					assert.deepEqual(snapshot(view.root), expected);
					assert.deepEqual(snapshot(other.root), expected);
					const range = view.root.addExtrinsicRange(0, 1, { message: "after rebase" });
					view.root.insertAt(0, "Y");
					assert.deepEqual(endpoints(view.root, range), [1, 2]);
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
			const range = other.root.addExtrinsicRange(1, 4, { message: "winner's storage" });
			other.root.insertAt(0, "Z");
			assert.deepEqual(endpoints(other.root, range), [2, 5]);
			provider.synchronizeMessages();
			assert.deepEqual(snapshot(other.root), snapshot(view.root));
		});

		it("replicates tracked edits and range updates sequentially", () => {
			const { provider, view } = setup();
			view.root.addExtrinsicRange(1, 4, { message: "range" });
			provider.synchronizeMessages();
			const other = provider.trees[1].viewWith(config);
			view.root.insertAt(0, "X");
			provider.synchronizeMessages();
			assert.deepEqual(snapshot(other.root), {
				text: "Xabcdef",
				ranges: [[2, 5, "range"]],
			});
			other.root.removeRange(1, 4);
			provider.synchronizeMessages();
			assert.deepEqual(snapshot(view.root), { text: "Xdef", ranges: [[1, 2, "range"]] });
		});

		for (const [name, edit] of Object.entries({
			firstContentEdit: edits.insert,
			firstRange: (text: Text): void => {
				text.addExtrinsicRange(1, 4, { message: "range" });
			},
		})) {
			it(`undoes and redoes ${name} including storage initialization`, () => {
				const { provider, view } = setup();
				const initial = JSON.stringify(view.root);
				const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				edit(view.root);
				const edited = JSON.stringify(view.root);
				provider.synchronizeMessages();
				const undo = undoStack.pop();
				assert(undo !== undefined);
				undo.revert();
				assert.equal(JSON.stringify(view.root), initial);
				assert.deepEqual(view.root.ranges, []);
				const redo = redoStack.pop();
				assert(redo !== undefined);
				redo.revert();
				assert.equal(JSON.stringify(view.root), edited);
				const range = view.root.addExtrinsicRange(0, 1, { message: "after redo" });
				view.root.insertAt(0, "Y");
				assert.deepEqual(endpoints(view.root, range), [1, 2]);
				unsubscribe();
			});

			it(`rebuilds the tracker after undoing ${name} and editing again`, () => {
				const { provider, view } = setup();
				const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
				edit(view.root);
				provider.synchronizeMessages();
				const undo = undoStack.pop();
				assert(undo !== undefined);
				undo.revert();
				const range = view.root.addExtrinsicRange(1, 4, { message: "replacement" });
				view.root.insertAt(0, "X");
				assert.deepEqual(endpoints(view.root, range), [2, 5]);
				unsubscribe();
			});
		}

		it("rolls back initialization with the outer transaction and can edit afterward", () => {
			const { view } = setup();
			const initial = JSON.stringify(view.root);
			const result = view.runTransaction(() => {
				const temporary = view.root.addExtrinsicRange(1, 4, { message: "temporary" });
				view.root.insertAt(0, "X");
				assert.deepEqual(endpoints(view.root, temporary), [2, 5]);
				return { rollback: true };
			});
			assert.equal(result.success, false);
			assert.equal(JSON.stringify(view.root), initial);
			const range = view.root.addExtrinsicRange(1, 4, { message: "replacement" });
			view.root.insertAt(0, "Y");
			assert.deepEqual(endpoints(view.root, range), [2, 5]);
		});

		it("rejects undoing initial storage creation after an intervening range edit", () => {
			const { provider, view } = setup();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
			view.root.insertAt(0, "X");
			const undo = undoStack.pop();
			assert(undo !== undefined);
			view.root.addExtrinsicRange(1, 4, { message: "keep" });
			provider.synchronizeMessages();
			undo.revert();
			assert.deepEqual(snapshot(view.root), { text: "Xabcdef", ranges: [[1, 4, "keep"]] });
			unsubscribe();
		});
	});
});
