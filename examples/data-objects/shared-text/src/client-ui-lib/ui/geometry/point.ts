/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IPoint {
    x: number;
    y: number;
}

export function distanceSquared(a: IPoint, b: IPoint) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return dx * dx + dy * dy;
}

export class Point implements IPoint {
    // Constructor
    constructor(public x: number, public y: number) {
    }
}
