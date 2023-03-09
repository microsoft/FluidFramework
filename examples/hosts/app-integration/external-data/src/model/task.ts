/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell } from "@fluidframework/cell";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { SharedString } from "@fluidframework/sequence";

import type { ExternalSnapshotTask, ITask, ITaskEvents } from "../model-interface";

export class Task extends TypedEventEmitter<ITaskEvents> implements ITask {
	public get id(): string {
		return this._id;
	}
	// Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
	public get draftName(): SharedString {
		return this._draftName;
	}
	public get draftPriority(): number {
		const cellValue = this._draftPriority.get();
		if (cellValue === undefined) {
			throw new Error("Expected a valid priority");
		}
		return cellValue;
	}
	public set draftPriority(newPriority: number) {
		this._draftPriority.set(newPriority);
	}
	public get externalDataSnapshot(): ExternalSnapshotTask {
		return this._externalDataSnapshot;
	}
	public set externalDataSnapshot(newValue: ExternalSnapshotTask) {
		const changesAvailable = newValue.changeType !== undefined;
		this._externalDataSnapshot = { ...newValue };
		this.emit("changesAvailable", changesAvailable);
	}
	private _externalDataSnapshot: ExternalSnapshotTask = {
		id: this._id,
		name: undefined,
		priority: undefined,
		changeType: undefined,
	};
	public constructor(
		private readonly _id: string,
		private readonly _draftName: SharedString,
		private readonly _draftPriority: ISharedCell<number>,
	) {
		super();
		this._draftName.on("sequenceDelta", () => {
			this.emit("draftNameChanged");
		});
		this._draftPriority.on("valueChanged", () => {
			this.emit("draftPriorityChanged");
		});
	}
	public overwriteWithExternalData = (): void => {
		this.externalDataSnapshot.changeType = undefined;
		if (this.externalDataSnapshot.priority !== undefined) {
			this._draftPriority.set(this.externalDataSnapshot.priority);
		}
		if (this.externalDataSnapshot.name !== undefined) {
			const oldString = this._draftName.getText();
			this._draftName.replaceText(0, oldString.length, this.externalDataSnapshot.name);
		}
		this.emit("changesAvailable", false);
	};
}
