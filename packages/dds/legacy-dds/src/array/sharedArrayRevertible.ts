/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedArrayRevertible, IRevertible } from "./interfaces.js";
import type { ISharedArrayOperation } from "./sharedArrayOperations.js";
import { OperationType } from "./sharedArrayOperations.js";

/**
 * @internal
 */
export class SharedArrayRevertible implements IRevertible {
	private readonly sharedArray: ISharedArrayRevertible;
	private readonly op: ISharedArrayOperation;
	public constructor(sharedArray: ISharedArrayRevertible, op: ISharedArrayOperation) {
		this.sharedArray = sharedArray;
		this.op = op;
	}

	public revert(): void {
		switch (this.op.type) {
			case OperationType.insertEntry: {
				this.sharedArray.toggle(this.op.entryId);
				break;
			}
			case OperationType.deleteEntry: {
				this.sharedArray.toggle(this.op.entryId);
				break;
			}
			case OperationType.toggle: {
				this.sharedArray.toggle(this.op.entryId);
				break;
			}
			case OperationType.moveEntry: {
				this.sharedArray.toggleMove(this.op.entryId, this.op.changedToEntryId);
				break;
			}
			case OperationType.toggleMove: {
				this.sharedArray.toggleMove(this.op.changedToEntryId, this.op.entryId);
				break;
			}
			default: {
				throw new Error(`Unknown operation type`);
			}
		}
	}

	public dispose(): void {}
}
