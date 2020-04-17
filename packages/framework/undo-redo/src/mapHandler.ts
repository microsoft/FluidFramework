/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueChanged } from "@microsoft/fluid-map";
import { IRevertable, UndoRedoStackManager } from "./undoRedoStackManager";

/**
 * A shared map undo redo handler that will add all local map changes to the provided
 * undo redo stack manager
 */
export class SharedMapUndoRedoHandler {
    constructor(private readonly stackManager: UndoRedoStackManager) { }

    public attachMap(map: ISharedMap) {
        map.on("valueChanged", this.mapDeltaHandler);
    }
    public detachMap(map: ISharedMap) {
        map.off("valueChanged", this.mapDeltaHandler);
    }

    private readonly mapDeltaHandler = (changed: IValueChanged, local: boolean, op, target: ISharedMap) => {
        if (local) {
            this.stackManager.pushToCurrentOperation(new SharedMapRevertable(changed, target));
        }
    };
}

/**
 * Tracks a change on a shared map allows reverting it
 */
export class SharedMapRevertable implements IRevertable {

    constructor(
        private readonly changed: IValueChanged,
        private readonly map: ISharedMap,
    ) { }

    public revert() {
        this.map.set(this.changed.key, this.changed.previousValue);
    }

    public disgard() {
        return;
    }
}
