/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "./core";
import * as tools from "./tools";

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

export interface IClearAction {
}

export interface IStylusAction {
    // The location of the stylus
    point: core.IPoint;

    // The ink pressure applied
    pressure: number;

    // Identifier of the stylus performing the action. This value is unique
    // per down...up operation
    id: string;
}

export interface IStylusDownAction extends IStylusAction {
    // Pen data if the pen has changed with this stroke
    pen: tools.IPen;

    // Where to insert the new ink layer. Where the highest z-ordered layer has index 0.
    // This operation is reserved for merges.
    layer: number;
}

export interface IStylusUpAction extends IStylusAction {
}

export interface IStylusMoveAction extends IStylusAction {
}
