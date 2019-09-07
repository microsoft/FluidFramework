/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IInkStroke,
} from "./interfaces";

/**
 * Ink snapshot interface.
 */
export interface ISerializableInk {
    /**
     * Collection of the strokes in this snapshot.
     */
    strokes: IInkStroke[];

    /**
     * Stores a mapping from the provided key to its index in strokes. Since
     * ISerializableInk is serialized we need to use an index.
     */
    strokeIndex: { [key: string]: number };
}

/**
 * Maintains a live record of the data that can be used for snapshotting.
 */
export class InkData {
    private strokes: IInkStroke[];
    private strokeIndex: { [key: string]: number };

    /**
     * Construct a new snapshot.
     * @param snapshot - Existing snapshot to be cloned
     */
    constructor(snapshot?: ISerializableInk) {
        this.strokes = snapshot ? snapshot.strokes : [];
        this.strokeIndex = snapshot ? snapshot.strokeIndex : {};
    }

    /**
     * Get the ink strokes from the snapshot.
     */
    public getStrokes(): IInkStroke[] {
        return this.strokes;
    }

    /**
     * Get a specific stroke from the snapshot.
     *
     * @param key - The UUID for the stroke
     */
    public getStroke(key: string): IInkStroke {
        return this.strokes[this.strokeIndex[key]];
    }

    /**
     * Clear all data from the snapshot
     */
    public clear() {
        this.strokes = [];
        this.strokeIndex = {};
    }

    public addStroke(stroke: IInkStroke) {
        this.strokes.push(stroke);
        this.strokeIndex[stroke.id] = this.strokes.length - 1;
    }

    public getSerializable(): ISerializableInk {
        return {
            strokes: this.strokes,
            strokeIndex: this.strokeIndex,
        };
    }
}
