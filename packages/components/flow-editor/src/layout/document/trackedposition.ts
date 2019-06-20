/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export type TrackedPositionCallback = (node: Node, nodeOffset: number) => void;

/**
 * A position in the FlowDocument and a callback to be invoked with the DOM node
 * and offset within the dom node where that position is rendered.
 */
export interface ITrackedPosition {
    position: number;
    callback: TrackedPositionCallback;
    sync?: boolean;
}
