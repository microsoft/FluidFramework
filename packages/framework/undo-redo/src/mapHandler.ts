/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueChanged } from "@fluidframework/map";
import { IRevertible, UndoRedoStackManager } from "./undoRedoStackManager";

/**
 * A shared map undo redo handler that will add all local map changes to the provided
 * undo redo stack manager
 */
export class SharedMapUndoRedoHandler {
    constructor(private readonly stackManager: UndoRedoStackManager) { }

    public attachMap(map: ISharedMap) {
        map.on("valueChanged", this.mapDeltaHandler);
        map.on("rollback", this.mapRollbackHandler);
    }
    public detachMap(map: ISharedMap) {
        map.off("valueChanged", this.mapDeltaHandler);
        map.off("rollback", this.mapRollbackHandler);
    }

    private readonly mapDeltaHandler = (changed: IValueChanged, local: boolean, target: ISharedMap) => {
        if (local) {
            this.stackManager.pushToCurrentOperation(new SharedMapRevertible(changed, target));
        }
    };

    private readonly mapRollbackHandler = (key: string, target: ISharedMap) => {
        const lastRevertible = this.stackManager.rollbackLastRevertible ?
            this.stackManager.rollbackLastRevertible() : undefined;
        if (!lastRevertible) {
            throw new Error("Nothing to rollback");
        }
        const sharedMapRevertible = lastRevertible as SharedMapRevertible;
        if (sharedMapRevertible.matchRollback && !sharedMapRevertible.matchRollback(key, target)) {
                throw new Error("Last revertible does not match operation rolled back");
        }
    };
}

/**
 * Tracks a change on a shared map allows reverting it
 */
export class SharedMapRevertible implements IRevertible {
    constructor(
        private readonly changed: IValueChanged,
        private readonly map: ISharedMap,
    ) { }

    public revert() {
        if (this.changed.previousValue === undefined) {
            this.map.delete(this.changed.key);
        } else {
            this.map.set(this.changed.key, this.changed.previousValue);
        }
    }

    public discard() {
        return;
    }

    /**
     * Compare change to be rolled back against this revertible
     */
    public matchRollback?(key: string, target: ISharedMap): boolean {
        return this.map === target &&
            this.changed.key === key &&
            this.changed.previousValue === target[key];
    }
}
