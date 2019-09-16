/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@microsoft/fluid-shared-object-base";

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
export interface IInk extends ISharedObject {
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
     * Send the op and process it
     * @param operation - op to submit
     */
    submitOperation(operation: IInkOperation);
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

export interface ICreateStrokeOperation {
    type: "createStroke";

    time: number;

    id: string;

    pen: IPen;
}

/**
 * Base interface for stylus operations.
 */
export interface IStylusOperation {
    type: "stylus";

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

export type IInkOperation =
    IClearOperation |
    ICreateStrokeOperation |
    IStylusOperation;

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
    operations: IStylusOperation[];

    pen: IPen;
}
