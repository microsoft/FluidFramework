/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IPoint {
    x: number;
    y: number;
}

export class Point implements IPoint {
    // Constructor
    constructor(public x: number, public y: number) {
    }
}
