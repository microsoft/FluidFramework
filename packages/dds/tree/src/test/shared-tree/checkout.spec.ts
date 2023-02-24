/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// import { strict as assert } from "assert";
// import { moveToDetachedField, rootFieldKeySymbol, TransactionResult } from "../../core";
// import { singleTextCursor } from "../../feature-libraries";
// import { brand } from "../../util";
import { TestTreeProvider } from "../utils";

describe("SharedTree Checkout", () => {
	it("works", async () => {
		const provider = await TestTreeProvider.create(1);
		const [tree] = provider.trees;
		const checkout = tree.fork();

		// 	tree.provider.trees[0].runTransaction((f, editor) => {
		// 		const writeCursor = singleTextCursor({ type: brand("LonelyNode") });
		// 		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		// 		field.insert(0, writeCursor);

		// 		return TransactionResult.Apply;
		// 	});

		// 	const { forest } = provider.trees[0];
		// 	const readCursor = forest.allocateCursor();
		// 	moveToDetachedField(forest, readCursor);
		// 	assert(readCursor.firstNode());
		// 	assert.equal(readCursor.nextNode(), false);
		// 	readCursor.free();
		// });
	});
});
