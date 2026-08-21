/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import type { TreeNode } from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Importing code being tested
import type { PlainText } from "../../text/textDomain.js";
import { describeHydration, hydrateNode } from "../simple-tree/index.js";

type TextNode = PlainText.Members & TreeNode;

/**
 * Tests insertion-anchor behavior shared by plain and formatted text.
 */
export function testInsertionAnchors(createText: (value: string) => TextNode): void {
	describeHydration("createInsertionAnchor", (_init, hydrated) => {
		const initialize = (value: string): TextNode => {
			const text = createText(value);
			if (hydrated) {
				hydrateNode(text);
			}
			return text;
		};

		it("creates an anchor at any valid insertion point", () => {
			const text = initialize("abc");
			for (const index of [0, 1, 3]) {
				const anchor = text.createInsertionAnchor(index);
				assert.equal(anchor.index, index);
				anchor.dispose();
			}
		});

		it("tracks insertions before, at, and after the anchor", () => {
			const text = initialize("abc");
			const anchor = text.createInsertionAnchor(1);

			text.insertAt(0, "x");
			assert.equal(anchor.index, 2);
			text.insertAt(anchor.index, "y");
			assert.equal(anchor.index, 3);
			text.insertAt(text.characterCount(), "z");
			assert.equal(anchor.index, 3);
			anchor.dispose();
		});

		it("tracks removals before, across, and after the anchor", () => {
			const text = initialize("abcdef");
			const anchor = text.createInsertionAnchor(4);

			text.removeRange(0, 2);
			assert.equal(anchor.index, 2);
			text.removeRange(1, 3);
			assert.equal(anchor.index, 1);
			text.removeRange(1, 2);
			assert.equal(anchor.index, 1);
			anchor.dispose();
		});

		it("tracks an anchor in empty text", () => {
			const text = initialize("");
			const anchor = text.createInsertionAnchor(0);

			text.insertAt(0, "a");
			assert.equal(anchor.index, 1);
			anchor.dispose();
		});

		it("throws for an invalid initial index", () => {
			const text = initialize("abc");
			assert.throws(() => text.createInsertionAnchor(-1), validateUsageError(/non-negative/));
			assert.throws(() => text.createInsertionAnchor(4), validateUsageError(/out of bounds/));
		});

		it("throws when reading a disposed anchor", () => {
			const text = initialize("abc");
			const anchor = text.createInsertionAnchor(1);
			anchor.dispose();

			assert.throws(() => anchor.index, validateUsageError(/disposed/));
			anchor.dispose();
		});
	});
}
