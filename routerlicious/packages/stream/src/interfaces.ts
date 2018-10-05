import { ICollaborativeObject } from "@prague/api-definitions";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";

export interface IPoint {
    x: number;
    y: number;
}

export interface IColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * Fluent implementation of the IDelta interface to make creation the underlying operation easier.
 * Only one operation per delta is currently supported but it's expected this will expand to multiple in
 * the future
 */
export class Delta implements IDelta {
    constructor(public operations: IOperation[] = []) {
    }

    /**
     * Composes two ink delta streams together - which is as simple as appending their operation
     * logs
     */
    public compose(delta: IDelta) {
        this.operations = this.operations.concat(delta.operations);
    }

    public push(operation: IOperation) {
        this.operations.push(operation);
    }

    public clear(time: number = new Date().getTime()): Delta {
        const clear: IClearAction = { };

        this.operations.push({ clear, time });

        return this;
    }

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
 * Retrieves the type of action contained within the operation
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
 * Extracts the IStylusAction contained in the operation
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
 * Helper function to retrieve the ID of the stylus operation
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

export interface IStream extends ICollaborativeObject {
    getLayers(): IInkLayer[];

    getLayer(key: string): IInkLayer;

    submitOp(op: IDelta);
}

/**
 * Pen data for the current stroke
 */
export interface IPen {
    // Color in web format #rrggbb
    color: IColor;

    // Thickness of pen in pixels
    thickness: number;
}

/**
 * Type of action
 */
export enum ActionType {
    // Action of placing the stylus on the canvas
    StylusDown,

    // Action of picking the stylus up from the canvas
    StylusUp,

    // Stylus has moved on the canvas
    StylusMove,

    // Canvas has been cleared
    Clear,
}

// tslint:disable-next-line:no-empty-interface
export interface IClearAction {
}

export interface IStylusAction {
    // The location of the stylus
    point: IPoint;

    // The ink pressure applied
    pressure: number;

    // Identifier of the stylus performing the action. This value is unique
    // per down...up operation
    id: string;
}

export interface IStylusDownAction extends IStylusAction {
    // Pen data if the pen has changed with this stroke
    pen: IPen;

    // Where to insert the new ink layer. Where the highest z-ordered layer has index 0.
    // This operation is reserved for merges.
    layer: number;
}

// tslint:disable-next-line:no-empty-interface
export interface IStylusUpAction extends IStylusAction {
}

// tslint:disable-next-line:no-empty-interface
export interface IStylusMoveAction extends IStylusAction {
}

export interface IOperation {
    // Time, in milliseconds, that the operation occurred on the originating device
    time: number;

    // We follow the Delta pattern of using a key on an object to specify the action.
    // This is probably good regardless since it encapsulates the name of the action as
    // a string (the key) - which should help with backwards compatability. It also
    // allows us to statically type the action we set with the type. As opposed to storing
    // an enum with the action which could drift from the true type
    clear?: IClearAction;
    stylusDown?: IStylusDownAction;
    stylusUp?: IStylusUpAction;
    stylusMove?: IStylusMoveAction;
}

export interface IInkLayer {
    // unique identifier for the ink layer
    id: string;

    // The operations to perform in the given layer
    operations: IOperation[];
}

export interface IDelta {
    operations: IOperation[];
}

export interface IStream extends ICollaborativeObject {
    getLayers(): IInkLayer[];

    getLayer(key: string): IInkLayer;

    submitOp(op: IDelta);
}
