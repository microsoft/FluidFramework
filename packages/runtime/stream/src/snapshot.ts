/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IInkDelta,
    IInkOperation,
    IInkStroke,
    IStylusDownOperation,
    IStylusMoveOperation,
    IStylusUpOperation,
} from "./interfaces";

/**
 * Ink snapshot interface.
 */
export interface IInkSnapshot {
    /**
     * Collection of the strokes in this snapshot.
     */
    strokes: IInkStroke[];

    /**
     * Stores a mapping from the provided key to its index in strokes. Since
     * IInkSnapshot is serialized we need to use an index.
     */
    strokeIndex: { [key: string]: number };
}

/**
 * Maintains a live record of the data that can be used for snapshotting.
 */
export class InkSnapshot implements IInkSnapshot {
    /**
     * Clone an existing snapshot to create a new one.
     *
     * @param snapshot - Existing snapshot to be cloned
     */
    public static clone(snapshot: IInkSnapshot) {
        return new InkSnapshot(snapshot.strokes, snapshot.strokeIndex);
    }

    /**
     * Construct a new snapshot.
     *
     * @param strokes - strokes in the snapshot
     * @param strokeIndex - matching strokeIndex mapping for the strokes argument if passed
     */
    constructor(public strokes: IInkStroke[] = [], public strokeIndex: {[key: string]: number } = {}) {
    }

    /**
     * Apply each operation in the provided delta to the snapshot.
     *
     * @param delta - The delta to apply
     */
    public apply(delta: IInkDelta) {
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
        switch (operation.type) {
            case "clear":
                this.processClearOperation();
                break;
            case "up":
                this.processStylusUpOperation(operation);
                break;
            case "down":
                this.processStylusDownOperation(operation);
                break;
            case "move":
                this.processStylusMoveOperation(operation);
                break;
            default:
                throw new Error("Unknown action type");
        }
    }

    /**
     * Respond to incoming clear operation.
     */
    private processClearOperation() {
        this.strokes = [];
        this.strokeIndex = {};
    }

    /**
     * Respond to incoming stylus up operation.
     *
     * @param operation - The stylus up operation
     */
    private processStylusUpOperation(operation: IInkOperation) {
        // TODO - longer term on ink up - or possibly earlier - we can attempt to smooth the provided ink
        this.addOperationToStroke((operation as IStylusUpOperation).id, operation);
    }

    /**
     * Respond to incoming stylus down operation.
     *
     * @param operation - The stylus down operation
     */
    private processStylusDownOperation(operation: IInkOperation) {
        const stylusOperation = operation as IStylusDownOperation;
        const stroke = {
            id: stylusOperation.id,
            operations: [],
        };

        this.strokes.push(stroke);

        // Create a reference to the specified stroke
        let strokeIndex = this.strokes.length - 1;
        this.strokeIndex[stroke.id] = strokeIndex;

        // And move any after it down by one
        for (strokeIndex = strokeIndex + 1; strokeIndex < this.strokes.length; strokeIndex++) {
            const strokeId = this.strokes[strokeIndex].id;
            this.strokeIndex[strokeId] = this.strokeIndex[strokeId] + 1;
        }

        // And save the stylus down
        this.addOperationToStroke(stylusOperation.id, operation);
    }

    /**
     * Respond to incoming stylus move operation.
     *
     * @param operation - The stylus move operation
     */
    private processStylusMoveOperation(operation: IInkOperation) {
        this.addOperationToStroke((operation as IStylusMoveOperation).id, operation);
    }

    /**
     * Adds a given operation to a given stroke.
     *
     * @param id - The id of the stroke the operation should be added to
     * @param operation - The operation to add
     */
    private addOperationToStroke(id: string, operation: IInkOperation) {
        // TODO: Why is this operation sometimes undefined?
        if (this.strokeIndex[id] !== undefined) {
            const strokeIndex = this.strokeIndex[id];
            if (this.strokes[strokeIndex].operations === undefined) {
                this.strokes[strokeIndex].operations = [];
            }
            this.strokes[strokeIndex].operations.push(operation);
        }
    }
}
