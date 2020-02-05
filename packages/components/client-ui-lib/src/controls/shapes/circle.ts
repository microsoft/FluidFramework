/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPoint, Rectangle } from "../../ui";
import { IShape } from "./shape";

export interface ICircle extends IShape {
    center: IPoint;
    radius: number;
}

export class Circle implements ICircle {
    constructor(public center: IPoint, public radius: number) {
    }

    public render(context2D: CanvasRenderingContext2D, offset: IPoint) {
        const x = this.center.x - offset.x;
        const y = this.center.y - offset.y;

        context2D.moveTo(x, y);
        context2D.arc(x, y, this.radius, 0, Math.PI * 2);
    }

    public getBounds(): Rectangle {
        return new Rectangle(this.center.x, this.center.y, this.radius, this.radius);
    }
}
