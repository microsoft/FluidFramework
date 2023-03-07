/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { RevisionTag } from "../rebase";
import { RepairDataStore } from "../repair";

export class TransactionStack {
	private readonly stack: { startRevision: RevisionTag; repairStore?: RepairDataStore }[] = [];

	public get size() {
		return this.stack.length;
	}

	public get repairStore(): RepairDataStore | undefined {
		return this.stack[this.stack.length - 1]?.repairStore;
	}

	public push(startRevision: RevisionTag, repairStore?: RepairDataStore): void {
		this.stack.push({ startRevision, repairStore });
	}

	public pop(): { startRevision: RevisionTag; repairStore?: RepairDataStore } {
		return this.stack.pop() ?? fail("No transaction is currently in progress");
	}
}
