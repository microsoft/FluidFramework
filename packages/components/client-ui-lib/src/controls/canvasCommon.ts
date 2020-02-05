/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInkPoint, IPen } from "@microsoft/fluid-ink";
import { IPoint, IVector, Point, Vector } from "../ui";
import { SegmentCircleInclusive } from "./overlayCanvas";
// eslint-disable-next-line import/no-internal-modules
import { Circle, IShape, Polygon } from "./shapes/index";

/**
 * Given start point and end point, get MixInk shapes to render. The returned MixInk
 * shapes may contain one or two circles whose center is either start point or end point.
 * Enum SegmentCircleInclusive determins whether circle is in the return list.
 * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
 */
export function getShapes(
    startPoint: IInkPoint,
    endPoint: IInkPoint,
    pen: IPen,
    circleInclusive: SegmentCircleInclusive): IShape[] {

    const dirVector = new Vector(
        endPoint.x - startPoint.x,
        endPoint.y - startPoint.y);
    const len = dirVector.length();

    const shapes = new Array<IShape>();
    let trapezoidP0: IPoint;
    let trapezoidP1: IPoint;
    let trapezoidP2: IPoint;
    let trapezoidP3: IPoint;
    let normalizedLateralVector: IVector;

    // Scale by a power curve to trend towards thicker values
    const widthAtStart = pen.thickness * Math.pow(startPoint.pressure, 0.5) / 2;
    const widthAtEnd = pen.thickness * Math.pow(endPoint.pressure, 0.5) / 2;

    // Just draws a circle on small values??
    if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
        const center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
        shapes.push(new Circle({ x: center.x, y: center.y }, widthAtEnd));
        return shapes;
    }

    if (len === 0) {
        return null;
    }

    if (widthAtStart !== widthAtEnd) {
        let angle = Math.acos(Math.abs(widthAtStart - widthAtEnd) / len);

        if (widthAtStart < widthAtEnd) {
            angle = Math.PI - angle;
        }

        normalizedLateralVector = Vector.normalize(Vector.rotate(dirVector, -angle));
        trapezoidP0 = new Point(
            startPoint.x + widthAtStart * normalizedLateralVector.x,
            startPoint.y + widthAtStart * normalizedLateralVector.y);
        trapezoidP3 = new Point(
            endPoint.x + widthAtEnd * normalizedLateralVector.x,
            endPoint.y + widthAtEnd * normalizedLateralVector.y);

        normalizedLateralVector = Vector.normalize(Vector.rotate(dirVector, angle));
        trapezoidP2 = new Point(
            endPoint.x + widthAtEnd * normalizedLateralVector.x,
            endPoint.y + widthAtEnd * normalizedLateralVector.y);
        trapezoidP1 = new Point(
            startPoint.x + widthAtStart * normalizedLateralVector.x,
            startPoint.y + widthAtStart * normalizedLateralVector.y);
    } else {
        normalizedLateralVector = new Vector(-dirVector.y / len, dirVector.x / len);

        trapezoidP0 = new Point(
            startPoint.x + widthAtStart * normalizedLateralVector.x,
            startPoint.y + widthAtStart * normalizedLateralVector.y);
        trapezoidP1 = new Point(
            startPoint.x - widthAtStart * normalizedLateralVector.x,
            startPoint.y - widthAtStart * normalizedLateralVector.y);

        trapezoidP2 = new Point(
            endPoint.x - widthAtEnd * normalizedLateralVector.x,
            endPoint.y - widthAtEnd * normalizedLateralVector.y);
        trapezoidP3 = new Point(
            endPoint.x + widthAtEnd * normalizedLateralVector.x,
            endPoint.y + widthAtEnd * normalizedLateralVector.y);
    }

    const polygon = new Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
    shapes.push(polygon);

    switch (circleInclusive) {
        case SegmentCircleInclusive.None:
            break;
        case SegmentCircleInclusive.Both:
            shapes.push(new Circle({ x: startPoint.x, y: startPoint.y }, widthAtStart));
            shapes.push(new Circle({ x: endPoint.x, y: endPoint.y }, widthAtEnd));
            break;
        case SegmentCircleInclusive.Start:
            shapes.push(new Circle({ x: startPoint.x, y: startPoint.y }, widthAtStart));
            break;
        case SegmentCircleInclusive.End:
            shapes.push(new Circle({ x: endPoint.x, y: endPoint.y }, widthAtEnd));
            break;
        default:
            break;
    }

    return shapes;
}
