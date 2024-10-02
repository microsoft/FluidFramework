/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISharedObject,
	ISharedObjectEvents,
} from "@fluidframework/shared-object-base/internal";

/**
 * Data about a single point in an ink stroke
 * @internal
 */
export interface IInkPoint {
	/**
	 * X coordinate
	 */
	x: number;

	/**
	 * Y coordinate
	 */
	y: number;

	/**
	 * Time, in milliseconds, that the point was generated on the originating device.
	 */
	time: number;

	/**
	 * The ink pressure applied (typically from PointerEvent.pressure).
	 */
	pressure: number;
}

/**
 * RGBA color.
 * @internal
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
 * @internal
 */
export interface IInkEvents extends ISharedObjectEvents {
	(event: "stylus", listener: (operation: IStylusOperation) => void);
	(event: "clear", listener: () => void);
}

/**
 * Shared data structure for representing ink.
 * @internal
 */
export interface IInk extends ISharedObject<IInkEvents> {
	/**
	 * Create a stroke with the given pen information.
	 * @param pen - The pen information for this stroke
	 * @returns The stroke that was created
	 */
	createStroke(pen: IPen): IInkStroke;

	/**
	 * Append the given point to the indicated stroke.
	 * @param point - The point to append
	 * @param id - The ID for the stroke to append to
	 * @returns The stroke that was updated
	 */
	appendPointToStroke(point: IInkPoint, id: string): IInkStroke;

	/**
	 * Clear all strokes.
	 */
	clear(): void;

	/**
	 * Get the collection of strokes stored in this Ink object.
	 * @returns the array of strokes
	 */
	getStrokes(): IInkStroke[];

	/**
	 * Get a specific stroke with the given key.
	 * @param key - ID for the stroke
	 * @returns the requested stroke, or undefined if it does not exist
	 */
	getStroke(key: string): IInkStroke;
}

/**
 * Pen data for the current stroke
 * @internal
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
 * @internal
 */
export interface IClearOperation {
	/**
	 * String identifier for the operation type.
	 */
	type: "clear";

	/**
	 * Time, in milliseconds, that the operation occurred on the originating device.
	 */
	time: number;
}

/**
 * Create stroke operations notify clients that a new stroke has been created, along with basic information about
 * the stroke.
 * @internal
 */
export interface ICreateStrokeOperation {
	/**
	 * String identifier for the operation type.
	 */
	type: "createStroke";

	/**
	 * Time, in milliseconds, that the operation occurred on the originating device.
	 */
	time: number;

	/**
	 * Unique ID that will be used to reference this stroke.
	 */
	id: string;

	/**
	 * Description of the pen used to create the stroke.
	 */
	pen: IPen;
}

/**
 * Base interface for stylus operations.
 * @internal
 */
export interface IStylusOperation {
	/**
	 * String identifier for the operation type.
	 */
	type: "stylus";

	/**
	 * The ink point appended in this operation.
	 */
	point: IInkPoint;

	/**
	 * ID of the stroke this stylus operation is associated with.
	 */
	id: string;
}

/**
 * Ink operations are one of several types.
 * @internal
 */
export type IInkOperation = IClearOperation | ICreateStrokeOperation | IStylusOperation;

/**
 * Represents a single ink stroke.
 * @internal
 */
export interface IInkStroke {
	/**
	 * Unique identifier for the ink stroke.
	 */
	id: string;

	/**
	 * The points contained within the stroke.
	 */
	points: IInkPoint[];

	/**
	 * Description of the pen used to create the stroke.
	 */
	pen: IPen;
}
