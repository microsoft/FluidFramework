/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IColor, IInk, IInkPoint, IInkStroke, IPen, IStylusOperation } from "./interfaces";

interface IPoint {
    x: number;
    y: number;
}

class Vector {
    /**
     * Returns the vector resulting from rotating vector by angle
     */
    public static rotate(vector: Vector, angle: number): Vector {
        return new Vector(
            vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
            vector.x * Math.sin(angle) + vector.y * Math.cos(angle));
    }

    /**
     * Returns the normalized form of the given vector
     */
    public static normalize(vector: Vector): Vector {
        const length = vector.length();
        return new Vector(vector.x / length, vector.y / length);
    }

    constructor(public x: number, public y: number) {
    }

    public length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

function drawPolygon(context: CanvasRenderingContext2D, points: IPoint[]) {
    if (points.length === 0) {
        return;
    }

    context.beginPath();
    // Move to the first point
    context.moveTo(points[0].x, points[0].y);

    // Draw the rest of the segments
    for (let i = 1; i < points.length; i++) {
        context.lineTo(points[i].x, points[i].y);
    }

    // And then close the shape
    context.lineTo(points[0].x, points[0].y);
    context.closePath();
    context.fill();
}

function drawCircle(context: CanvasRenderingContext2D, center: IPoint, radius: number) {
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.closePath();
    context.fill();
}

function drawShapes(
    context: CanvasRenderingContext2D,
    startPoint: IInkPoint,
    endPoint: IInkPoint,
    pen: IPen,
): void {
    const dirVector = new Vector(
        endPoint.x - startPoint.x,
        endPoint.y - startPoint.y);
    const len = dirVector.length();

    const widthAtStart = pen.thickness * startPoint.pressure;
    const widthAtEnd = pen.thickness * endPoint.pressure;

    if (len + Math.min(widthAtStart, widthAtEnd) > Math.max(widthAtStart, widthAtEnd)) {
        // Circles don't completely overlap, need a trapezoid
        const normalizedLateralVector = new Vector(-dirVector.y / len, dirVector.x / len);

        const trapezoidP0 = {
            x: startPoint.x + widthAtStart * normalizedLateralVector.x,
            y: startPoint.y + widthAtStart * normalizedLateralVector.y,
        };
        const trapezoidP1 = {
            x: startPoint.x - widthAtStart * normalizedLateralVector.x,
            y: startPoint.y - widthAtStart * normalizedLateralVector.y,
        };
        const trapezoidP2 = {
            x: endPoint.x - widthAtEnd * normalizedLateralVector.x,
            y: endPoint.y - widthAtEnd * normalizedLateralVector.y,
        };
        const trapezoidP3 = {
            x: endPoint.x + widthAtEnd * normalizedLateralVector.x,
            y: endPoint.y + widthAtEnd * normalizedLateralVector.y,
        };

        drawPolygon(context, [trapezoidP0, trapezoidP1, trapezoidP2, trapezoidP3]);
    }

    // End circle
    // TODO should only draw if not eclipsed by the previous circle, be careful about single-point
    drawCircle(context, { x: endPoint.x, y: endPoint.y }, widthAtEnd);
}

export class InkCanvas {
    private readonly context: CanvasRenderingContext2D;
    private readonly localActiveStrokeMap: Map<number, string> = new Map();
    private readonly currentPen: IPen;

    constructor(private readonly canvas: HTMLCanvasElement, private readonly model: IInk) {
        this.model.on("clear", this.redraw.bind(this));
        this.model.on("stylus", this.handleStylus.bind(this));
        this.canvas.style.touchAction = "none";

        this.canvas.addEventListener("pointerdown", this.handlePointerDown.bind(this));
        this.canvas.addEventListener("pointermove", this.handlePointerMove.bind(this));
        this.canvas.addEventListener("pointerup", this.handlePointerUp.bind(this));

        const context = this.canvas.getContext("2d");
        // eslint-disable-next-line no-null/no-null
        if (context === null) {
            throw new Error("InkCanvas requires a canvas with 2d rendering context");
        }
        this.context = context;

        this.currentPen = {
            color: { r: 0, g: 161, b: 241, a: 0 },
            thickness: 7,
        };

        this.sizeCanvasBackingStore();
    }

    public setPenColor(color: IColor) {
        this.currentPen.color = color;
    }

    public replay() {
        this.clearCanvas();

        const strokes = this.model.getStrokes();

        // Time of the first operation in stroke 0 is our starting time
        const startTime = strokes[0].points[0].time;
        for (const stroke of strokes) {
            this.animateStroke(stroke, 0, startTime);
        }
    }

    public clear() {
        this.model.clear();
        this.redraw();
    }

    public sizeCanvasBackingStore() {
        const canvasBoundingClientRect = this.canvas.getBoundingClientRect();
        // Scale the canvas size to match the physical pixel to avoid blurriness
        const scale = window.devicePixelRatio;
        this.canvas.width = Math.floor(canvasBoundingClientRect.width * scale);
        this.canvas.height = Math.floor(canvasBoundingClientRect.height * scale);
        // Scale the context to bring back coordinate system in CSS pixels
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.scale(scale, scale);

        this.redraw();
    }

    private handlePointerDown(evt: PointerEvent) {
        // We will accept pen down or mouse left down as the start of a stroke.
        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            const strokeId = this.model.createStroke(this.currentPen).id;
            this.localActiveStrokeMap.set(evt.pointerId, strokeId);

            this.appendPointerEventToStroke(evt);

            evt.preventDefault();
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (this.localActiveStrokeMap.has(evt.pointerId)) {
            const evts = (evt as any)?.getCoalescedEvents() ?? [evt] as PointerEvent[];
            for (const e of evts) {
                this.appendPointerEventToStroke(e);
            }
        }
    }

    private handlePointerUp(evt: PointerEvent) {
        if (this.localActiveStrokeMap.has(evt.pointerId)) {
            this.appendPointerEventToStroke(evt);
            this.localActiveStrokeMap.delete(evt.pointerId);
        }
    }

    private appendPointerEventToStroke(evt: PointerEvent) {
        const strokeId = this.localActiveStrokeMap.get(evt.pointerId);
        if (strokeId === undefined) {
            throw new Error("Unexpected pointer ID trying to append to stroke");
        }
        const inkPt = {
            x: evt.offsetX,
            y: evt.offsetY,
            time: Date.now(),
            pressure: evt.pressure,
        };
        this.model.appendPointToStroke(inkPt, strokeId);
    }

    private animateStroke(stroke: IInkStroke, operationIndex: number, startTime: number) {
        if (operationIndex >= stroke.points.length) {
            return;
        }

        // Draw the requested stroke
        const current = stroke.points[operationIndex];
        const previous = stroke.points[Math.max(0, operationIndex - 1)];
        const time = operationIndex === 0
            ? current.time - startTime
            : current.time - previous.time;

        setTimeout(() => {
            this.drawStrokeSegment(stroke.pen, current, previous);
            this.animateStroke(stroke, operationIndex + 1, startTime);
        }, time);
    }

    /**
     * Clears the canvas
     */
    private clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private redraw() {
        this.clearCanvas();

        const strokes = this.model.getStrokes();
        for (const stroke of strokes) {
            let previous = stroke.points[0];
            for (const current of stroke.points) {
                // For the down, current === previous === stroke.operations[0]
                this.drawStrokeSegment(stroke.pen, current, previous);
                previous = current;
            }
        }
    }

    private drawStrokeSegment(
        pen: IPen,
        current: IInkPoint,
        previous: IInkPoint,
    ) {
        // TODO Consider save/restore context
        // TODO Consider half-pixel offset
        this.context.fillStyle = `rgb(${pen.color.r}, ${pen.color.g}, ${pen.color.b})`;
        drawShapes(this.context, previous, current, pen);
    }

    private handleStylus(operation: IStylusOperation) {
        // Render the dirty stroke
        const dirtyStrokeId = operation.id;
        const stroke = this.model.getStroke(dirtyStrokeId);
        // If this is the only point in the stroke, we'll use it for both the start and end of the segment
        const prevPoint = stroke.points[stroke.points.length - (stroke.points.length >= 2 ? 2 : 1)];
        this.drawStrokeSegment(stroke.pen, prevPoint, operation.point);
    }
}
