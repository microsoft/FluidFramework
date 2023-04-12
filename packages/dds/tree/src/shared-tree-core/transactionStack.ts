/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RepairDataStore, RevisionTag } from "../core";
import { fail } from "../util";

/**
 * A helper class that organizes the state needed for managing nesting transactions.
 */
export class TransactionStack {
	private readonly stack: {
		startRevision: RevisionTag;
		revision: RevisionTag;
		repairStore?: RepairDataStore;
	}[] = [];

	/**
	 * The number of transactions currently ongoing.
	 */
	public get size() {
		return this.stack.length;
	}

	/**
	 * @returns the repair data store for the current transaction, or `undefined` if no transaction is ongoing.
	 */
	public get repairStore(): RepairDataStore | undefined {
		return this.stack[this.stack.length - 1]?.repairStore;
	}

	/**
	 * @returns the revision that the outermost transaction will have once it is squashed, or `undefined` if no transaction is ongoing.
	 */
	public get outerRevision(): RevisionTag | undefined {
		return this.stack[0]?.revision;
	}

	/**
	 * Pushes a new transaction onto the stack. That transaction becomes the current transaction.
	 * @param startRevision - the revision of the latest commit when this transaction begins
	 * @param repairStore - an optional repair data store for helping with undo or rollback operations
	 */
	public push(
		startRevision: RevisionTag,
		revision: RevisionTag,
		repairStore?: RepairDataStore,
	): void {
		this.stack.push({ startRevision, revision, repairStore });
	}

	/**
	 * Ends the current transaction. Fails if there is currently no ongoing transaction.
	 * @returns The revision that the closed transaction began on, and its repair data store if it has one.
	 */
	public pop(): {
		startRevision: RevisionTag;
		revision: RevisionTag;
		repairStore?: RepairDataStore;
	} {
		return this.stack.pop() ?? fail("No transaction is currently in progress");
	}
}
