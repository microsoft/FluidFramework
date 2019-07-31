/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { InkActionType, getInkActionType, IDelta, IInkLayer, IInkOperation } from "./interfaces";

/**
 * Ink snapshot interface.
 */
export interface IInkSnapshot {
    /**
     * Collection of the layers in this snapshot.
     */
    layers: IInkLayer[];

    /**
     * Stores a mapping from the provided key to its index in layers. Since
     * IInkSnapshot is serialized we need to use an index.
     */
    layerIndex: { [key: string]: number };
}

/**
 * Ink snapshot.
 */
export class InkSnapshot implements IInkSnapshot {
    /**
     * Clone an existing snapshot to create a new one.
     *
     * @param snapshot - Existing snapshot to be cloned
     */
    public static clone(snapshot: IInkSnapshot) {
        return new InkSnapshot(snapshot.layers, snapshot.layerIndex);
    }

    /**
     * Construct a new snapshot.
     *
     * @param layers - layers in the snapshot
     * @param layerIndex - matching layerIndex mapping for the layers argument if passed
     */
    constructor(public layers: IInkLayer[] = [], public layerIndex: {[key: string]: number } = {}) {
    }

    /**
     * Apply each operation in the provided delta to the snapshot.
     *
     * @param delta - The delta to apply
     */
    public apply(delta: IDelta) {
        for (const operation of delta.operations) {
            this.applyOperation(operation);
        }
    }

    /**
     * Apply a single operation to the snapshot.
     *
     * @param operation - The operation to apply
     */
    public applyOperation(operation: IInkOperation) {
        const actionType = getInkActionType(operation);

        switch (actionType) {
            case InkActionType.Clear:
                this.processClearAction(operation);
                break;
            case InkActionType.StylusUp:
                this.processStylusUpAction(operation);
                break;
            case InkActionType.StylusDown:
                this.processStylusDownAction(operation);
                break;
            case InkActionType.StylusMove:
                this.processStylusMoveAction(operation);
                break;
            default:
                throw new Error("Unknown action type");
        }
    }

    /**
     * Respond to incoming clear operation.
     *
     * @param operation - The clear operation
     */
    private processClearAction(operation: IInkOperation) {
        this.layers = [];
        this.layerIndex = {};
    }

    /**
     * Respond to incoming stylus up operation.
     *
     * @param operation - The stylus up operation
     */
    private processStylusUpAction(operation: IInkOperation) {
        // TODO - longer term on ink up - or possibly earlier - we can attempt to smooth the provided ink
        this.addOperationToLayer(operation.stylusUp.id, operation);
    }

    /**
     * Respond to incoming stylus down operation.
     *
     * @param operation - The stylus down operation
     */
    private processStylusDownAction(operation: IInkOperation) {
        const layer = {
            id: operation.stylusDown.id,
            operations: [],
        };

        // Push if we are inserting at the end - otherwise splice to insert at the specified location
        if (operation.stylusDown.layer === 0) {
            this.layers.push(layer);
        } else {
            this.layers.splice(this.layers.length - operation.stylusDown.layer, 0, layer);
        }

        // Create a reference to the specified layer
        let layerIndex = this.layers.length - 1 - operation.stylusDown.layer;
        this.layerIndex[layer.id] = layerIndex;

        // And move any after it down by one
        for (layerIndex = layerIndex + 1; layerIndex < this.layers.length; layerIndex++) {
            const layerId = this.layers[layerIndex].id;
            this.layerIndex[layerId] = this.layerIndex[layerId] + 1;
        }

        // And save the stylus down
        this.addOperationToLayer(operation.stylusDown.id, operation);
    }

    /**
     * Respond to incoming stylus move operation.
     *
     * @param operation - The stylus move operation
     */
    private processStylusMoveAction(operation: IInkOperation) {
        this.addOperationToLayer(operation.stylusMove.id, operation);
    }

    /**
     * Adds a given operation to a given layer.
     *
     * @param id - The id of the layer the operation should be added to
     * @param operation - The operation to add
     */
    private addOperationToLayer(id: string, operation: IInkOperation) {
        // TODO: Why is this operation sometimes undefined?
        if (this.layerIndex[id] !== undefined) {
            const layerIndex = this.layerIndex[id];
            if (this.layers[layerIndex].operations === undefined) {
                this.layers[layerIndex].operations = [];
            }
            this.layers[layerIndex].operations.push(operation);
        }
    }
}
