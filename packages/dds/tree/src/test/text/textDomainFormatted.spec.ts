/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TreeAlpha } from "../../shared-tree/index.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
// Allow importing file being tested
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree } from "../../text/textDomainFormatted.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";
import { testSchemaCompatibilitySnapshots } from "../snapshots/index.js";
import { suitesWithAndWithoutProduction } from "../utils.js";

describe("textDomainFormatted", () => {
	it("compatibility", () => {
		const currentViewSchema = new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree });
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.81.0", "formattedText");
	});

	it("basic unformatted use", () => {
		const text = FormattedTextAsTree.Tree.fromString("hello");
		assert.equal(text.fullString(), "hello");
		assert.deepEqual([...text.characters()], ["h", "e", "l", "l", "o"]);
		text.insertAt(5, " world");
		assert.equal(text.fullString(), "hello world");
		text.removeRange(0, 6);
		assert.equal(text.fullString(), "world");
	});

	it("formatting", () => {
		const text = FormattedTextAsTree.Tree.fromString("hello");
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

	it("insertWithFormattingAt", () => {
		const text = FormattedTextAsTree.Tree.fromString("ab");
		text.insertWithFormattingAt(1, [
			{ content: { content: "c" }, format: { ...text.defaultFormat, italic: true } },
		]);
		assert.equal(text.fullString(), "acb");
		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => [
				atom.content.content,
				atom.format.italic,
			]),
			[
				["a", false],
				["c", true],
				["b", false],
			],
		);
	});

	it("defaultFormat", () => {
		const text = FormattedTextAsTree.Tree.fromString("ab");
		text.defaultFormat.underline = true;
		text.insertAt(2, "cd");
		assert.deepEqual(
			[...text.charactersWithFormatting()].map((atom) => [
				atom.content.content,
				atom.format.underline,
			]),
			[
				["a", false],
				["b", false],
				["c", true],
				["d", true],
			],
		);
	});

	// Hydrated and unhydrated trees implement cursors differently which impacts observation tracking, so test both.
	// Specifically unhydrated tree cursors do observation tracking while hydrated ones do not.
	describeHydration("observation tracking", (init, hydrated) => {
		// Text has debug asserts which can add observations, so ensure tracking works with and without production build emulation.
		suitesWithAndWithoutProduction((emulateProduction) => {
			function setupObservations(): [FormattedTextAsTree.Tree, string[]] {
				const text = FormattedTextAsTree.Tree.fromString("hello");
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
				assert(char instanceof FormattedTextAsTree.StringTextAtom);
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
