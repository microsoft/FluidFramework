/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPoint, Rectangle } from "../../ui";
import { IShape } from "./shape";

export interface IPolygon extends IShape {
    points: IPoint[];
}

export class Polygon implements IPolygon {
    private readonly bounds: Rectangle;

    /**
     * Constructs a new polygon composed of the given points. The polygon
     * takes ownership of the passed in array of points.
     */
    constructor(public points: IPoint[]) {
        // TODO need to add an "empty" rectangle concept - until then 0, 0 is empty
        let minX = points.length > 0 ? points[0].x : 0;
        let minY = points.length > 0 ? points[0].y : 0;
        let maxX = minX;
        let maxY = minY;

        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        this.bounds = new Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    public render(context: CanvasRenderingContext2D, offset: IPoint) {
        if (this.points.length === 0) {
            return;
        }

        // Move to the first point
        context.moveTo(this.points[0].x - offset.x, this.points[0].y - offset.y);

        // Draw the rest of the segments
        for (let i = 1; i < this.points.length; i++) {
            context.lineTo(this.points[i].x - offset.x, this.points[i].y - offset.y);
        }

        // And then close the shape
        context.lineTo(this.points[0].x - offset.x, this.points[0].y - offset.y);
    }

    public getBounds(): Rectangle {
        return this.bounds;
    }
}
