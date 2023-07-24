/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RepairDataStore, RevisionTag, ChangeFamilyEditor } from "../core";
import { fail } from "../util";
import { SharedTreeBranch } from "./branch";

/**
 * A helper class that organizes the state needed for managing nesting transactions.
 */
export class TransactionStack<TEditor extends ChangeFamilyEditor, TChange> {
	private readonly stack: {
		startRevision: RevisionTag;
		repairStore?: RepairDataStore<TChange>;
		forks: Set<SharedTreeBranch<TEditor, TChange>>;
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
	public get repairStore(): RepairDataStore<TChange> | undefined {
		return this.stack[this.stack.length - 1]?.repairStore;
	}

	/**
	 * Pushes a new transaction onto the stack. That transaction becomes the current transaction.
	 * @param startRevision - the revision of the latest commit when this transaction begins
	 * @param repairStore - an optional repair data store for helping with undo or rollback operations
	 */
	public push(
		startRevision: RevisionTag,
		repairStore?: RepairDataStore<TChange>,
		forks: Set<SharedTreeBranch<TEditor, TChange>> = new Set(),
	): void {
		this.stack.push({ startRevision, repairStore, forks });
	}

	/**
	 * Ends the current transaction. Fails if there is currently no ongoing transaction.
	 * @returns The revision that the closed transaction began on, its repair data store if it has one and all the forks that ocurred inside it.
	 */
	public pop(): {
		startRevision: RevisionTag;
		repairStore?: RepairDataStore<TChange>;
		forks: Set<SharedTreeBranch<TEditor, TChange>>;
	} {
		return this.stack.pop() ?? fail("No transaction is currently in progress");
	}

	/**
	 * The last transaction stored. Fails if there is currently no ongoing transaction.
	 * @returns The revision that the closed transaction began on, its repair data store if it has one and all the forks that ocurred inside it.
	 */
	public peek(): {
		startRevision: RevisionTag;
		repairStore?: RepairDataStore<TChange>;
		forks: Set<SharedTreeBranch<TEditor, TChange>>;
	} {
		return this.stack[this.stack.length - 1] ?? fail("No transaction is currently in progress");
	}
}
