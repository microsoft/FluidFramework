/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag } from "../core/index.js";
import { fail } from "../util/index.js";

/**
 * A helper class that organizes the state needed for managing nesting transactions.
 */
export class TransactionStack {
	private readonly stack: {
		startRevision: RevisionTag;
		dispose: () => void;
	}[] = [];

	/**
	 * The number of transactions currently ongoing.
	 */
	public get size(): number {
		return this.stack.length;
	}

	/**
	 * Pushes a new transaction onto the stack. That transaction becomes the current transaction.
	 * @param startRevision - the revision of the latest commit when this transaction begins
	 * @param disposables - an optional collection of disposable data to release after finishing a transaction
	 */
	public push(startRevision: RevisionTag, dispose: () => void): void {
		this.stack.push({ startRevision, dispose });
	}

	/**
	 * Ends the current transaction. Fails if there is currently no ongoing transaction.
	 * @returns The revision that the closed transaction began on.
	 */
	public pop(): {
		startRevision: RevisionTag;
	} {
		const transaction = this.stack.pop() ?? fail("No transaction is currently in progress");
		transaction.dispose();
		return transaction;
	}
}
