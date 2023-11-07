/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";

/**
 * Data about a single point in an ink stroke.
 *
 * @alpha
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
 *
 * @alpha
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
 * Events emitted by {@link IInk}.
 *
 * @alpha
 */
export interface IInkEvents extends ISharedObjectEvents {
	(event: "stylus", listener: (operation: IStylusOperation) => void);
	(event: "clear", listener: () => void);
}

/**
 * A shared object which holds a collection of ink strokes.
 *
 * @example Creation and setup
 *
 * To create an `Ink` object, call the static `create` method:
 *
 * ```typescript
 * const ink = Ink.create(this.runtime, id);
 * ```
 *
 * You'll also need an `IPen` that will describe the style of your stroke:
 *
 * ```typescript
 * this.currentPen = {
 *     color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
 *     thickness: 7,
 * };
 * ```
 *
 * @example Usage
 *
 * Once the `Ink` object is created, you can add and update ink strokes using `createStroke` and
 * `appendPointToStroke`.  Most likely you'll want to do this in response to incoming Pointer Events:
 *
 * ```typescript
 * private handlePointerDown(e: PointerEvent) {
 *     const newStroke = ink.createStroke(this.currentPen);
 *     this.currentStrokeId = newStroke.id;
 *     handlePointerMotion(e);
 * }
 *
 * private handlePointerMotion(e: PointerEvent) {
 *     const inkPoint = {
 *         x: e.clientX,
 *         y: e.clientY,
 *         time: Date.now(),
 *         pressure: e.pressure,
 *     };
 *     ink.appendPointToStroke(inkPoint, this.currentStrokeId);
 * }
 *
 * canvas.addEventListener("pointerdown", this.handlePointerDown);
 * canvas.addEventListener("pointermove", this.handlePointerMotion);
 * canvas.addEventListener("pointerup", this.handlePointerMotion);
 * ```
 *
 * You can also clear all the ink with `clear`:
 *
 * ```typescript
 * ink.clear();
 * ```
 *
 * To observe and react to changes to the ink from both your own modifications as well as remote participants,
 * you can listen to the `"createStroke"`, `"stylus"` and `"clear"` events.  Since you don't need to render anything
 * yet when a stroke is first created, registering for `"createStroke"` may not be necessary.
 *
 * ```typescript
 * ink.on("stylus", this.renderStylusUpdate.bind(this));
 * ink.on("clear", this.renderClear.bind(this));
 * ```
 *
 * @alpha
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
 * Pen data for the current stroke.
 *
 * @alpha
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
 *
 * @alpha
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
 *
 * @alpha
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
 *
 * @alpha
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
 *
 * @alpha
 */
export type IInkOperation = IClearOperation | ICreateStrokeOperation | IStylusOperation;

/**
 * Represents a single ink stroke.
 *
 * @alpha
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
