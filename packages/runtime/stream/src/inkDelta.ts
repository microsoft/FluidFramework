/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import {
    IClearOperation,
    IInkDelta,
    IInkOperation,
    IPen,
    IPoint,
    IStylusDownOperation,
    IStylusMoveOperation,
    IStylusUpOperation,
} from "./interfaces";

/**
 * Fluent implementation of the IInkDelta interface to make creation the underlying operation easier.
 * Only one operation per delta is currently supported but it's expected this will expand to multiple in
 * the future.
 */
export class InkDelta implements IInkDelta {
    /**
     * Create a new InkDelta.
     *
     * @param operations - Operations to include in this delta (only one operation per delta is currently supported)
     */
    constructor(public operations: IInkOperation[] = []) {
    }

    /**
     * Composes two ink deltas together by appending their operation logs.
     *
     * @param delta - Other delta stream to append
     */
    public compose(delta: IInkDelta) {
        this.operations = this.operations.concat(delta.operations);
    }

    /**
     * Append an operation to the ink delta.
     *
     * @param operation - The new operation
     */
    public push(operation: IInkOperation) {
        this.operations.push(operation);
    }

    /**
     * Append a clear operation to the ink delta.
     *
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public clear(time: number = new Date().getTime()): InkDelta {
        const operation: IClearOperation = {
            time,
            type: "clear",
        };

        this.operations.push(operation);

        return this;
    }

    /**
     * Append a stylus up operation to the ink delta stream.
     *
     * @param point - Location of the up
     * @param pressure - The ink pressure applied
     * @param id - Unique ID for the stylus
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public stylusUp(
        point: IPoint,
        pressure: number,
        id: string = uuid(),
    ): InkDelta {
        const time: number = new Date().getTime();

        const operation: IStylusUpOperation = {
            id,
            point,
            pressure,
            time,
            type: "up",
        };

        this.operations.push(operation);

        return this;
    }

    /**
     * Append a stylus down operation to the ink delta stream.
     *
     * @param point - Location of the down
     * @param pressure - The ink pressure applied
     * @param pen - Drawing characteristics of the pen
     * @param id - Unique ID for the stylus
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public stylusDown(
        point: IPoint,
        pressure: number,
        pen: IPen,
    ): InkDelta {
        const id: string = uuid();
        const time: number = new Date().getTime();

        const operation: IStylusDownOperation = {
            id,
            pen,
            point,
            pressure,
            time,
            type: "down",
        };

        this.operations.push(operation);

        return this;
    }

    /**
     * Append a stylus move operation to the ink delta stream.
     *
     * @param point - Location of the move
     * @param pressure - The ink pressure applied
     * @param id - Unique ID for the stylus
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public stylusMove(
        point: IPoint,
        pressure: number,
        id: string = uuid(),
    ): InkDelta {
        const time: number = new Date().getTime();

        const operation: IStylusMoveOperation = {
            id,
            point,
            pressure,
            time,
            type: "move",
        };
        this.operations.push(operation);

        return this;
    }
}
