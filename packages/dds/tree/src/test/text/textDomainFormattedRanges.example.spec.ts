/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	FormattedText,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

describe("FormattedText with ranges example", () => {
	it("tracks a comment while editing and formatting text", () => {
		const sf = new SchemaFactoryBeta("com.example.annotatedText");
		class Format extends sf.object("Format", { bold: sf.boolean }) {}
		class Comment extends sf.object("Comment", { message: sf.string }) {}
		class Text extends FormattedText.createSchemaWithRanges({
			schemaFactory: sf,
			formatSchema: Format,
			extraAtoms: [],
			defaultFormatInsertable: { bold: false },
			rangeDataSchema: Comment,
		}) {}

		const view = createIndependentTreeAlpha({ minVersionForCollab: "2.80.0" }).viewWith(
			new TreeViewConfiguration({ schema: Text }),
		);
		view.initialize(Text.fromString("Hello world"));
		const text = view.root;
		const comment = text.ranges.trackRange(
			"comment",
			{ start: 6, end: 11 },
			{ message: "Review this word" },
		);

		text.insertAt(0, "Say: ");
		const start = comment.start.index;
		const end = comment.end.index;
		assert.deepEqual([start, end], [11, 16]);
		assert.equal(text.getString(start, end), "world");
		text.formatRange(start, end, { bold: true });
		assert.equal(text.charactersWithFormatting()[start]?.format.bold, true);
		assert.deepEqual([comment.start.index, comment.end.index], [start, end]);

		text.removeRange(start, end);
		assert.deepEqual([comment.start.index, comment.end.index], [11, 11]);
		text.ranges.setRangeBounds("comment", { start: 5, end: 10 });
		comment.data = { message: "Review the greeting instead" };
		assert.equal(text.getString(5, 10), "Hello");
		text.ranges.removeTrackedRange("comment");
		assert.equal([...text.ranges.keys()].length, 0);
		view.dispose();
	});
});
