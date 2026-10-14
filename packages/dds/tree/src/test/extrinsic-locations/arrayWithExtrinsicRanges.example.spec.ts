/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	ArrayWithExtrinsicRanges,
	SchemaFactoryBeta,
	TreeArrayNode,
	TreeViewConfiguration,
	createIndependentTreeAlpha,
} from "@fluidframework/tree/alpha";

describe("ArrayWithExtrinsicRanges example", () => {
	it("keeps a review comment attached to a range of array content", () => {
		const sf = new SchemaFactoryBeta("com.example.review");
		class Comment extends sf.object("Comment", { message: sf.string }) {}
		class Document extends ArrayWithExtrinsicRanges.createSchema(sf, Comment, sf.string) {}

		const view = createIndependentTreeAlpha({ minVersionForCollab: "2.80.0" }).viewWith(
			new TreeViewConfiguration({ schema: Document }),
		);
		view.initialize(Document.create(["Plan", "Build", "Ship"]));

		const document = view.root;
		const comment = document.addExtrinsicRange(1, 3, { message: "Check these steps" });
		document.transactOnContent((content) => {
			content.insertAt(0, TreeArrayNode.spread(["Design", "Review"]));
			const { start, end } = document.getExtrinsicRange(comment);
			assert.deepEqual([start, end], [3, 5]);
			assert.deepEqual(content.slice(start, end), ["Build", "Ship"]);
		});

		document.transactOnContent((content) => content.removeRange(3, 5));
		assert.deepEqual(document.getExtrinsicRange(comment), { start: 3, end: 3 });
		assert.equal(document.ranges[0], comment);
		assert.equal(comment.data.message, "Check these steps");

		document.setExtrinsicRange(comment, 2, 3);
		comment.data.message = "Check the plan instead";
		const position = document.getExtrinsicRange(comment);
		assert.deepEqual(document.content.slice(position.start, position.end), ["Plan"]);
		document.removeExtrinsicRange(comment);
		assert.equal(document.ranges.length, 0);
		view.dispose();
	});
});
