/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as geometry from "../geometry/index";
import { IShape } from "./shape";

export interface ICircle extends IShape {
    center: geometry.IPoint;
    radius: number;
}

export class Circle implements ICircle {
    constructor(public center: geometry.IPoint, public radius: number) {
    }

    public render(context2D: CanvasRenderingContext2D) {
        context2D.moveTo(this.center.x, this.center.y);
        context2D.arc(this.center.x, this.center.y, this.radius, 0, Math.PI * 2);
    }
}
