/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as geometry from "../geometry/index";
import { IShape } from "./shape";

export interface IPolygon extends IShape {
    points: geometry.IPoint[];
}

export class Polygon implements IPolygon {
    private isDirty: boolean = true;

    /**
     * Constructs a new polygon composed of the given points. The polygon
     * takes ownership of the passed in array of points.
     */
    constructor(public points: geometry.IPoint[]) {
    }

    public render(context: CanvasRenderingContext2D) {
        if (this.points.length === 0) {
            return;
        }

        // Move to the first point
        context.moveTo(this.points[0].x, this.points[0].y);

        // Draw the rest of the segments
        for (let i = 1; i < this.points.length; i++) {
            context.lineTo(this.points[i].x, this.points[i].y);
        }

        // And then close the shape
        context.lineTo(this.points[0].x, this.points[0].y);
    }
}
