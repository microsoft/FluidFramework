/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPen, IStylusOperation } from "@microsoft/fluid-ink-stream";
import { IPoint, IVector, Point, Vector } from "../ui";
import { SegmentCircleInclusive } from "./overlayCanvas";
import { Circle, IShape, Polygon } from "./shapes/index";

/**
 * given start point and end point, get MixInk shapes to render. The returned MixInk
 * shapes may contain one or two circles whose center is either start point or end point.
 * Enum SegmentCircleInclusive determins whether circle is in the return list.
 * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
 */
export function getShapes(
    startPoint: IStylusOperation,
    endPoint: IStylusOperation,
    pen: IPen,
    circleInclusive: SegmentCircleInclusive): IShape[] {

    const dirVector = new Vector(
        endPoint.point.x - startPoint.point.x,
        endPoint.point.y - startPoint.point.y);
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
        shapes.push(new Circle({ x: center.point.x, y: center.point.y }, widthAtEnd));
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
            startPoint.point.x + widthAtStart * normalizedLateralVector.x,
            startPoint.point.y + widthAtStart * normalizedLateralVector.y);
        trapezoidP3 = new Point(
            endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
            endPoint.point.y + widthAtEnd * normalizedLateralVector.y);

        normalizedLateralVector = Vector.normalize(Vector.rotate(dirVector, angle));
        trapezoidP2 = new Point(
            endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
            endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
        trapezoidP1 = new Point(
            startPoint.point.x + widthAtStart * normalizedLateralVector.x,
            startPoint.point.y + widthAtStart * normalizedLateralVector.y);
    } else {
        normalizedLateralVector = new Vector(-dirVector.y / len, dirVector.x / len);

        trapezoidP0 = new Point(
            startPoint.point.x + widthAtStart * normalizedLateralVector.x,
            startPoint.point.y + widthAtStart * normalizedLateralVector.y);
        trapezoidP1 = new Point(
            startPoint.point.x - widthAtStart * normalizedLateralVector.x,
            startPoint.point.y - widthAtStart * normalizedLateralVector.y);

        trapezoidP2 = new Point(
            endPoint.point.x - widthAtEnd * normalizedLateralVector.x,
            endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
        trapezoidP3 = new Point(
            endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
            endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
    }

    const polygon = new Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
    shapes.push(polygon);

    switch (circleInclusive) {
        case SegmentCircleInclusive.None:
            break;
        case SegmentCircleInclusive.Both:
            shapes.push(new Circle({ x: startPoint.point.x, y: startPoint.point.y }, widthAtStart));
            shapes.push(new Circle({ x: endPoint.point.x, y: endPoint.point.y }, widthAtEnd));
            break;
        case SegmentCircleInclusive.Start:
            shapes.push(new Circle({ x: startPoint.point.x, y: startPoint.point.y }, widthAtStart));
            break;
        case SegmentCircleInclusive.End:
            shapes.push(new Circle({ x: endPoint.point.x, y: endPoint.point.y }, widthAtEnd));
            break;
        default:
            break;
    }

    return shapes;
}
