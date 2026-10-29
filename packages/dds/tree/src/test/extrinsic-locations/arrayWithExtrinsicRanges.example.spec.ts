/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	ExtrinsicLocations,
	SchemaFactoryBeta,
	TreeArrayNode,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

describe("ExtrinsicLocations example", () => {
	it("keeps a review comment attached to a range of array content", () => {
		const sf = new SchemaFactoryBeta("com.example.review");
		class Comment extends sf.object("Comment", { message: sf.string }) {}
		class Document extends ExtrinsicLocations.createArraySchema({
			schemaFactory: sf,
			rangeDataSchema: Comment,
			contentSchema: sf.string,
		}) {}

		const view = createIndependentTreeAlpha({ minVersionForCollab: "2.80.0" }).viewWith(
			new TreeViewConfiguration({ schema: Document }),
		);
		view.initialize(Document.create(["Plan", "Build", "Ship"]));

		const document = view.root;
		const comment = document.ranges.trackRange(
			"comment",
			{ start: 1, end: 3 },
			{ message: "Check these steps" },
		);
		document.transactOnContent((content) => {
			content.insertAt(0, TreeArrayNode.spread(["Design", "Review"]));
			const start = comment.start.index;
			const end = comment.end.index;
			assert.deepEqual([start, end], [3, 5]);
			assert.deepEqual(content.slice(start, end), ["Build", "Ship"]);
		});

		document.transactOnContent((content) => content.removeRange(3, 5));
		assert.deepEqual([comment.start.index, comment.end.index], [3, 3]);
		assert.equal(document.ranges.getRange("comment")?.data, comment.data);
		assert.equal(comment.data.message, "Check these steps");

		document.ranges.setRangeBounds("comment", { start: 2, end: 3 });
		comment.data = { message: "Check the plan instead" };
		const position = document.ranges.getRange("comment");
		assert(position !== undefined);
		assert.deepEqual(document.content.slice(position.start.index, position.end.index), [
			"Plan",
		]);
		document.ranges.removeTrackedRange("comment");
		assert.equal([...document.ranges.keys()].length, 0);
		view.dispose();
	});
});
