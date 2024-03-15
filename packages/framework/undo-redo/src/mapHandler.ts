/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueChanged } from "@fluidframework/map";
import { IRevertible, UndoRedoStackManager } from "./undoRedoStackManager.js";

/**
 * A shared map undo redo handler that will add all local map changes to the provided
 * undo redo stack manager
 * @internal
 */
export class SharedMapUndoRedoHandler {
	constructor(private readonly stackManager: UndoRedoStackManager) {}

	public attachMap(map: ISharedMap) {
		map.on("valueChanged", this.mapDeltaHandler);
	}
	public detachMap(map: ISharedMap) {
		map.off("valueChanged", this.mapDeltaHandler);
	}

	private readonly mapDeltaHandler = (
		changed: IValueChanged,
		local: boolean,
		target: ISharedMap,
	) => {
		if (local) {
			this.stackManager.pushToCurrentOperation(new SharedMapRevertible(changed, target));
		}
	};
}

/**
 * Tracks a change on a shared map allows reverting it
 * @internal
 */
export class SharedMapRevertible implements IRevertible {
	constructor(
		private readonly changed: IValueChanged,
		private readonly map: ISharedMap,
	) {}

	public revert() {
		this.map.set(this.changed.key, this.changed.previousValue);
	}

	public discard() {
		return;
	}
}
