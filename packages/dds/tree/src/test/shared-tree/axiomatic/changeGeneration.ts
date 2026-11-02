/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { tagChange, type TaggedChange } from "../../../core/index.js";
import type { SharedTreeChange, TreeCheckout } from "../../../shared-tree/index.js";

/**
 * A synchronous candidate edit, applied to an isolated fork of the input checkout.
 */
export interface SharedTreeTestOperation {
	readonly description: string;
	/**
	 * Submit at most one commit, using a transaction if multiple editor calls are needed.
	 * Do not dispose the checkout or retain resources beyond the operation's exploration scope.
	 */
	readonly apply: (checkout: TreeCheckout) => void;
}

/**
 * A generated state that remains valid until enumeration advances or closes.
 */
export interface GeneratedSharedTreeChange {
	readonly description: string;
	readonly checkout: TreeCheckout;
	/**
	 * The complete committed change, or undefined if the operation submitted no commit.
	 * Unchanged visible content does not imply the absence of a commit.
	 */
	readonly change: TaggedChange<SharedTreeChange> | undefined;
}

/**
 * Author each candidate on a separate production checkout and capture its complete change.
 * @remarks
 * Descendant exploration must finish before advancing this iterator.
 * Each child is disposed on advancement, early termination, or failure.
 * Callers own any additional resources they acquire, such as cloned revertibles.
 */
export function* generateSharedTreeChanges(
	parent: TreeCheckout,
	operations: Iterable<SharedTreeTestOperation>,
): IterableIterator<GeneratedSharedTreeChange> {
	assert.equal(parent.transaction.size, 0, "Cannot explore an open transaction");
	for (const operation of operations) {
		const checkout = parent.fork();
		try {
			const before = checkout.mainBranch.getHead();
			operation.apply(checkout);
			assert.equal(checkout.transaction.size, 0, "Operation left a transaction open");
			const after = checkout.mainBranch.getHead();
			assert(
				after === before || after.parent === before,
				"Operation must submit at most one commit",
			);
			yield {
				description: operation.description,
				checkout,
				change: after === before ? undefined : tagChange(after.change, after.revision),
			};
		} finally {
			try {
				while (checkout.transaction.size > 0) {
					checkout.transaction.abort();
				}
			} finally {
				checkout.dispose();
			}
		}
	}
}
