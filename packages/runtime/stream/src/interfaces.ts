/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@prague/shared-object-common";

/**
 * X/Y point.
 */
export interface IPoint {
    /**
     * X coordinate
     */
    x: number;
    /**
     * Y coordinate
     */
    y: number;
}

/**
 * RGBA color.
 */
export interface IColor {
    /**
     * Red value
     */
    r: number;

    /**
     * Green value
     */
    g: number;

    /**
     * Blue value
     */
    b: number;

    /**
     * Alpha value
     */
    a: number;
}

/**
 * Shared data structure for representing ink.
 */
export interface IStream extends ISharedObject {
    /**
     * Get the collection of strokes.
     */
    getStrokes(): IInkStroke[];

    /**
     * Get a specific stroke with the given key.
     *
     * @param key - ID for the stroke
     */
    getStroke(key: string): IInkStroke;

    /**
     * Send the op and apply.
     *
     * @param op - Op to submit
     */
    submitOp(op: IInkDelta);
}

/**
 * Pen data for the current stroke
 */
export interface IPen {
    /**
     * Color in RGBA.
     */
    color: IColor;

    /**
     * Thickness of pen in pixels.
     */
    thickness: number;
}

/**
 * Signals a clear operation.
 */
export interface IClearOperation {
    type: "clear";

    /**
     * Time, in milliseconds, that the operation occurred on the originating device.
     */
    time: number;
}

/**
 * Base interface for stylus operations.
 */
export interface IStylusOperation {
    type: "down" | "move" | "up";

    /**
     * Time, in milliseconds, that the operation occurred on the originating device.
     */
    time: number;

    /**
     * The location of the stylus.
     */
    point: IPoint;

    /**
     * The ink pressure applied (from PointerEvent.pressure).
     */
    pressure: number;

    /**
     * UUID for the stylus performing the operation. This value is unique
     * per down...up operation.
     */
    id: string;
}

/**
 * Signals a down operation.
 *
 * Also contains information about the pen that this stroke will be a member of.
 */
export interface IStylusDownOperation extends IStylusOperation {
    type: "down";

    /**
     * Pen data if the pen has changed with this stroke.
     */
    pen: IPen;
}

/**
 * Signals a move operation.
 */
export interface IStylusMoveOperation extends IStylusOperation {
    type: "move";
}

/**
 * Signals an up operation.
 */
export interface IStylusUpOperation extends IStylusOperation {
    type: "up";
}

export type IInkOperation = IClearOperation | IStylusDownOperation | IStylusMoveOperation | IStylusUpOperation;

/**
 * Represents a single ink stroke.
 */
export interface IInkStroke {
    /**
     * Unique identifier for the ink stroke.
     */
    id: string;

    /**
     * The operations contained within the stroke.
     */
    operations: IInkOperation[];
}

/**
 * Represents a collection of ink operations to apply.
 */
export interface IInkDelta {
    /**
     * Operations to include in this delta (only one operation per delta is currently supported).
     */
    operations: IInkOperation[];
}
