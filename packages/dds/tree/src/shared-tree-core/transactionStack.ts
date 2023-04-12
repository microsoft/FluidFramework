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
		repairStore?: RepairDataStore;
	}[] = [];

	/**
	 * A RepairDataStore that is scoped to the entire transaction stack rather than each change within a transaction.
	 * It should be able to capture repair data for the squashed change of the entire stack.
	 */
	public commitRepairStore: RepairDataStore | undefined;

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
	 * Pushes a new transaction onto the stack. That transaction becomes the current transaction.
	 * @param startRevision - the revision of the latest commit when this transaction begins
	 * @param repairStore - an optional repair data store for helping with undo or rollback operations
	 * @param commitRepairStore - an optional repair data store that is scoped to the entire transaction stack,
	 * is only used if this is the first transaction in the stack.
	 */
	public push(
		startRevision: RevisionTag,
		repairStore?: RepairDataStore,
		commitRepairStore?: RepairDataStore,
	): void {
		if (this.stack.length === 0) {
			this.commitRepairStore = commitRepairStore;
		}
		this.stack.push({ startRevision, repairStore });
	}

	/**
	 * Ends the current transaction. Fails if there is currently no ongoing transaction.
	 * @returns The revision that the closed transaction began on, and its repair data store if it has one.
	 */
	public pop(): {
		startRevision: RevisionTag;
		repairStore?: RepairDataStore;
		/**
		 * A RepairDataStore that is scoped to the entire transaction stack rather than each change within a transaction.
		 * It should be able to capture repair data for the squashed change of the entire stack.
		 * This is only returned when the transaction stack is empty after popping.
		 */
		commitRepairStore?: RepairDataStore;
	} {
		const currentTransaction = this.stack.pop();
		let commitRepairStore: RepairDataStore | undefined;
		if (this.stack.length === 0) {
			commitRepairStore = this.commitRepairStore;
			this.commitRepairStore = undefined;
		}
		return currentTransaction !== undefined
			? { ...currentTransaction, commitRepairStore }
			: fail("No transaction is currently in progress");
	}
}
