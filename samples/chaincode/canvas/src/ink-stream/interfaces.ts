/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@prague/shared-object-common";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";

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
 * Fluent implementation of the IDelta interface to make creation the underlying operation easier.
 * Only one operation per delta is currently supported but it's expected this will expand to multiple in
 * the future.
 */
export class Delta implements IDelta {
    /**
     * Create a new Delta.
     *
     * @param operations - Operations to include in this delta (only one operation per delta is currently supported)
     */
    constructor(public operations: IOperation[] = []) {
    }

    /**
     * Composes two ink deltas together by appending their operation logs.
     *
     * @param delta - Other delta stream to append
     */
    public compose(delta: IDelta) {
        this.operations = this.operations.concat(delta.operations);
    }

    /**
     * Append an operation to the ink delta.
     *
     * @param operation - The new operation
     */
    public push(operation: IOperation) {
        this.operations.push(operation);
    }

    /**
     * Append a clear operation to the ink delta.
     *
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public clear(time: number = new Date().getTime()): Delta {
        const clear: IClearAction = { };

        this.operations.push({ clear, time });

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
        time: number = new Date().getTime()): Delta {

        const stylusUp: IStylusUpAction = {
            id,
            point,
            pressure,
        };

        this.operations.push({ stylusUp, time });

        return this;
    }

    /**
     * Append a stylus down operation to the ink delta stream.
     *
     * @param point - Location of the down
     * @param pressure - The ink pressure applied
     * @param pen - Drawing characteristics of the pen
     * @param layer - Numerical index of where to insert the newly created layer
     * @param id - Unique ID for the stylus
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public stylusDown(
        point: IPoint,
        pressure: number,
        pen: IPen,
        layer: number = 0,
        id: string = uuid(),
        time: number = new Date().getTime()): Delta {

        const stylusDown: IStylusDownAction = {
            id,
            layer,
            pen,
            point,
            pressure,
        };

        this.operations.push({ stylusDown, time });

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
        time: number = new Date().getTime()): Delta {

        const stylusMove: IStylusMoveAction = {
            id,
            point,
            pressure,
        };
        this.operations.push({ stylusMove, time });

        return this;
    }
}

/**
 * Retrieves the type of action contained within the given operation.
 *
 * @param operation - The operation to get the action from
 */
export function getActionType(operation: IOperation): ActionType {
    if (operation.clear) {
        return ActionType.Clear;
    } else if (operation.stylusDown) {
        return ActionType.StylusDown;
    } else if (operation.stylusUp) {
        return ActionType.StylusUp;
    } else if (operation.stylusMove) {
        return ActionType.StylusMove;
    } else {
        throw new Error("Unknown action");
    }
}

/**
 * Extracts the type of stylus action contained in the operation.
 *
 * @param operation - The operation to get the stylus action from
 */
export function getStylusAction(operation: IOperation): IStylusAction {
    if (operation.stylusDown) {
        return operation.stylusDown;
    } else if (operation.stylusUp) {
        return operation.stylusUp;
    } else if (operation.stylusMove) {
        return operation.stylusMove;
    } else {
        throw new Error("Unknown action");
    }
}

/**
 * Helper function to retrieve the stylus ID of the operation.
 *
 * @param operation - The operation to get the stylus ID from
 */
export function getStylusId(operation: IOperation): string {
    const type = getActionType(operation);
    switch (type) {
        case ActionType.StylusDown:
            return operation.stylusDown.id;
        case ActionType.StylusUp:
            return operation.stylusUp.id;
        case ActionType.StylusMove:
            return operation.stylusMove.id;
        default:
            throw new Error("Non-stylus event");
    }
}

/**
 * Shared data structure for representing ink.
 */
export interface IStream extends ISharedObject {
    /**
     * Get the collection of layers.
     */
    getLayers(): IInkLayer[];

    /**
     * Get a specific layer with the given key.
     *
     * @param key - ID for the layer
     */
    getLayer(key: string): IInkLayer;

    /**
     * Send the op and apply.
     *
     * @param op - Op to submit
     */
    submitOp(op: IDelta);
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
 * Describes valid actions to insert in the stream.
 */
export enum ActionType {
    /**
     * Action of placing the stylus down on the canvas.
     */
    StylusDown,

    /**
     * Action of picking the stylus up from the canvas.
     */
    StylusUp,

    /**
     * Action of moving the stylus on the canvas.
     */
    StylusMove,

    /**
     * Action of clearing the canvas.
     */
    Clear,
}

/**
 * Signals a clear action when populating an IOperation.clear.
 */
// tslint:disable-next-line:no-empty-interface
export interface IClearAction {
}

/**
 * Base interface for stylus actions.
 */
export interface IStylusAction {
    /**
     * The location of the stylus.
     */
    point: IPoint;

    /**
     * The ink pressure applied (from PointerEvent.pressure).
     */
    pressure: number;

    /**
     * UUID for the stylus performing the action. This value is unique
     * per down...up operation.
     */
    id: string;
}

/**
 * Signals a down action when populating an IOperation.stylusDown.
 *
 * Also contains information about the pen and layer that this stroke will be a member of.
 */
export interface IStylusDownAction extends IStylusAction {
    /**
     * Pen data if the pen has changed with this stroke.
     */
    pen: IPen;

    /**
     * Where to insert the new ink layer. Where the highest z-ordered layer has index 0.
     * This operation is reserved for merges.
     */
    layer: number;
}

/**
 * Signals an up action when populating an IOperation.stylusUp.
 */
// tslint:disable-next-line:no-empty-interface
export interface IStylusUpAction extends IStylusAction {
}

/**
 * Signals a move action when populating an IOperation.stylusMove.
 */
// tslint:disable-next-line:no-empty-interface
export interface IStylusMoveAction extends IStylusAction {
}

/**
 * A single ink operation - should have only a single action member populated per instance.
 */
export interface IOperation {
    /**
     * Time, in milliseconds, that the operation occurred on the originating device.
     */
    time: number;

    // We follow the Delta pattern of using a key on an object to specify the action.
    // This is probably good regardless since it encapsulates the name of the action as
    // a string (the key) - which should help with backwards compatability. It also
    // allows us to statically type the action we set with the type. As opposed to storing
    // an enum with the action which could drift from the true type

    /**
     * Populated if this is a clear action.
     */
    clear?: IClearAction;
    /**
     * Populated if this is a stylus down action.
     */
    stylusDown?: IStylusDownAction;
    /**
     * Populated if this is a stylus up action.
     */
    stylusUp?: IStylusUpAction;
    /**
     * Populated if this is a stylus move action.
     */
    stylusMove?: IStylusMoveAction;
}

/**
 * Represents an organizational collection of ink operations.
 */
export interface IInkLayer {
    /**
     * Unique identifier for the ink layer.
     */
    id: string;

    /**
     * The operations contained within the layer.
     */
    operations: IOperation[];
}

/**
 * Represents a collection of ink operations to apply.
 */
export interface IDelta {
    /**
     * Operations to include in this delta (only one operation per delta is currently supported).
     */
    operations: IOperation[];
}
