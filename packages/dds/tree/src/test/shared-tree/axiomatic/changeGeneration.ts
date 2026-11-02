/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { tagChange, type TaggedChange } from "../../../core/index.js";
import type { SharedTreeChange, TreeCheckout } from "../../../shared-tree/index.js";

/**
 * A synchronous candidate edit that can be applied to a checkout.
 */
export interface SharedTreeTestOperation {
	/** Human-readable description of the change */
	readonly description: string;
	/**
	 * A callback that applies the change.
	 * It must generate exactly one commit, using a transaction if multiple editor calls are needed.
	 * It must not dispose the checkout.
	 */
	readonly apply: (checkout: TreeCheckout) => void;
}

/**
 * A generated state that remains valid until enumeration advances or closes.
 */
export interface GeneratedSharedTreeChange {
	/** Human-readable description of the change */
	readonly description: string;
	/** The checkout on which the change was applied */
	readonly checkout: TreeCheckout;
	/** The change applied */
	readonly change: TaggedChange<SharedTreeChange>;
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
			assert(after !== before, "Operation must submit a commit");
			assert(after.parent === before, "Operation must submit at most one commit");
			yield {
				description: operation.description,
				checkout,
				change: tagChange(after.change, after.revision),
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
