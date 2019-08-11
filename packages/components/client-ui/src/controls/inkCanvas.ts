/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as stream from "@prague/stream";
import * as ui from "../ui";
import { Image } from "./image";
import { SegmentCircleInclusive } from "./overlayCanvas";
import { Circle, IShape, Polygon } from "./shapes/index";
import { Video } from "./video";

interface IPtrEvtPoint {
    x: number;
    y: number;
}

interface IPointerPointProps {
    isEraser: boolean;
}

class EventPoint {
    public rawPosition: IPtrEvtPoint;
    public properties: IPointerPointProps;

    constructor(relative: HTMLElement, evt: PointerEvent) {
        const bcr = relative.getBoundingClientRect();
        this.rawPosition = {
            x: evt.clientX - bcr.left,
            y: evt.clientY - bcr.top,
        };
        this.properties = { isEraser: false };
    }
}

export class InkCanvas extends ui.Component {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private penID: number = -1;
    private canvasWrapper: HTMLElement;
    private currentStylusActionId: string;
    private currentPen: stream.IPen;
    private lastStrokeRenderOp: { [key: string]: number } = {};

    // constructor
    constructor(element: HTMLDivElement, private model: stream.IStream, private image?: CanvasImageSource) {
        super(element);

        this.model.on("op", (op) => {
            // Update the canvas
            this.addAndDrawStroke(op.contents as stream.IInkDelta, false);
        });

        this.model.on("load", () => {
            this.redraw();
        });

        // setup canvas
        this.canvasWrapper = document.createElement("div");
        this.canvasWrapper.classList.add("drawSurface");
        this.canvas = document.createElement("canvas");
        this.canvasWrapper.appendChild(this.canvas);
        element.appendChild(this.canvasWrapper);

        // get context
        this.context = this.canvas.getContext("2d");

        const bb = false;
        this.canvas.addEventListener("pointerdown", (evt) => this.handlePointerDown(evt), bb);
        this.canvas.addEventListener("pointermove", (evt) => this.handlePointerMove(evt), bb);
        this.canvas.addEventListener("pointerup", (evt) => this.handlePointerUp(evt), bb);

        this.currentPen = {
            color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
            thickness: 7,
        };
    }

    /**
     * Used to just enable/disable the ink events. Should only be used when needing to temporarily
     * disable ink (for DOM hit testing events, for example). The enableInk event is probably what you really want.
     */
    public enableInkHitTest(enable: boolean) {
        this.element.style.pointerEvents = enable ? "auto" : "none";
    }

    public setPenColor(color: stream.IColor) {
        this.currentPen.color = color;
    }

    public replay() {
        this.clearCanvas();

        const strokes = this.model.getStrokes();

        // Time of the first operation in stroke 0 is our starting time
        const startTime = strokes[0].operations[0].time;
        for (const stroke of strokes) {
            this.animateStroke(stroke, 0, startTime);
        }
    }

    public addPhoto(image: Image) {
        this.addChild(image);
        this.element.appendChild(image.element);
    }

    public addVideo(video: Video) {
        this.addChild(video);
        this.element.appendChild(video.element);
    }

    public clear() {
        const delta = new stream.InkDelta().clear();
        this.addAndDrawStroke(delta, true);
    }

    /**
     * Resizes the canvas
     */
    protected resizeCore(bounds: ui.Rectangle) {
        // Updates the size of the canvas
        this.canvas.width = bounds.width;
        this.canvas.height = bounds.height;

        // And then redraw the canvas
        this.redraw();
    }

    // We will accept pen down or mouse left down as the start of a stroke.
    // We will accept touch down or mouse right down as the start of a touch.
    private handlePointerDown(evt: PointerEvent) {
        this.penID = evt.pointerId;

        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Anchor and clear any current selection.
            const pt = new EventPoint(this.canvas, evt);

            const delta = new stream.InkDelta().stylusDown(pt.rawPosition, evt.pressure, this.currentPen);
            this.currentStylusActionId = (delta.operations[0] as stream.IStylusDownOperation).id;
            this.addAndDrawStroke(delta, true);

            evt.returnValue = false;
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            const pt = new EventPoint(this.canvas, evt);
            const delta = new stream.InkDelta().stylusMove(
                pt.rawPosition,
                evt.pressure,
                this.currentStylusActionId);
            this.addAndDrawStroke(delta, true);

            evt.returnValue = false;
        }

        return false;
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            this.penID = -1;
            const pt = new EventPoint(this.canvas, evt);
            evt.returnValue = false;

            const delta = new stream.InkDelta().stylusUp(
                pt.rawPosition,
                evt.pressure,
                this.currentStylusActionId);
            this.currentStylusActionId = undefined;

            this.addAndDrawStroke(delta, true);
        }

        return false;
    }

    private animateStroke(stroke: stream.IInkStroke, operationIndex: number, startTime: number) {
        if (operationIndex >= stroke.operations.length) {
            return;
        }

        // Draw the requested stroke
        const currentOperation = stroke.operations[operationIndex];
        const previousOperation = stroke.operations[Math.max(0, operationIndex - 1)];
        const time = operationIndex === 0
            ? currentOperation.time - startTime
            : currentOperation.time - previousOperation.time;

        setTimeout(() => {
            this.drawStroke(stroke, currentOperation, previousOperation);
            this.animateStroke(stroke, operationIndex + 1, startTime);
        }, time);
    }

    /**
     * Clears the canvas
     */
    private clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.image) {
            this.context.drawImage(this.image, 0, 0);
        }
    }

    private redraw() {
        this.clearCanvas();

        const strokes = this.model.getStrokes();
        for (const stroke of strokes) {
            let previous: stream.IInkOperation = stroke.operations[0];
            for (const operation of stroke.operations) {
                this.drawStroke(stroke, operation, previous);
                previous = operation;
            }
        }
    }

    private drawStroke(
        stroke: stream.IInkStroke,
        current: stream.IInkOperation,
        previous: stream.IInkOperation) {
        let shapes: IShape[];

        // Assume these are IStylusOperations at this point, we'll throw if it's a clear
        const currentOperation = (current as stream.IStylusOperation);
        const previousOperation = (previous as stream.IStylusOperation);
        const pen = (stroke.operations[0] as stream.IStylusDownOperation).pen;

        switch (current.type) {
            case "clear":
                throw new Error("Non-stylus event");

            case "down":
                shapes = this.getShapes(currentOperation, currentOperation, pen, SegmentCircleInclusive.End);
                break;

            case "move":
                shapes = this.getShapes(previousOperation, currentOperation, pen, SegmentCircleInclusive.End);
                break;

            case "up":
                shapes = this.getShapes(previousOperation, currentOperation, pen, SegmentCircleInclusive.End);
                break;

            default:
                break;
        }

        if (shapes) {
            this.context.fillStyle = ui.toColorStringNoAlpha(pen.color);
            for (const shape of shapes) {
                this.context.beginPath();
                shape.render(this.context, { x: 0, y: 0 });
                this.context.closePath();
                this.context.fill();
            }
        }
    }

    private addAndDrawStroke(delta: stream.IInkDelta, submit: boolean) {
        if (submit) {
            this.model.submitOp(delta);
        }

        const dirtyStrokeIds: Set<string> = new Set();
        for (const operation of delta.operations) {
            if (operation.type === "clear") {
                this.clearCanvas();
                this.lastStrokeRenderOp = {};
                dirtyStrokeIds.clear();
            } else {
                // Get the stroke the delta applies to
                const strokeId = operation.id;
                dirtyStrokeIds.add(strokeId);
            }
        }

        // Render all the dirty strokes
        for (const id of dirtyStrokeIds) {
            let index = this.lastStrokeRenderOp[id] ? this.lastStrokeRenderOp[id] : 0;

            const stroke = this.model.getStroke(id);
            for (; index < stroke.operations.length; index++) {
                // render the stroke
                this.drawStroke(stroke, stroke.operations[index], stroke.operations[Math.max(0, index - 1)]);
            }

            this.lastStrokeRenderOp[id] = index;
        }
    }

    /***
     * given start point and end point, get MixInk shapes to render. The returned MixInk
     * shapes may contain one or two circles whose center is either start point or end point.
     * Enum SegmentCircleInclusive determins whether circle is in the return list.
     * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
     */
    private getShapes(
        startPoint: stream.IStylusOperation,
        endPoint: stream.IStylusOperation,
        pen: stream.IPen,
        circleInclusive: SegmentCircleInclusive): IShape[] {

        const dirVector = new ui.Vector(
            endPoint.point.x - startPoint.point.x,
            endPoint.point.y - startPoint.point.y);
        const len = dirVector.length();

        const shapes = new Array<IShape>();
        let trapezoidP0: ui.IPoint;
        let trapezoidP1: ui.IPoint;
        let trapezoidP2: ui.IPoint;
        let trapezoidP3: ui.IPoint;
        let normalizedLateralVector: ui.IVector;

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

            normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, -angle));
            trapezoidP0 = new ui.Point(
                startPoint.point.x + widthAtStart * normalizedLateralVector.x,
                startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP3 = new ui.Point(
                endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y + widthAtEnd * normalizedLateralVector.y);

            normalizedLateralVector = ui.Vector.normalize(ui.Vector.rotate(dirVector, angle));
            trapezoidP2 = new ui.Point(
                endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
            trapezoidP1 = new ui.Point(
                startPoint.point.x + widthAtStart * normalizedLateralVector.x,
                startPoint.point.y + widthAtStart * normalizedLateralVector.y);
        } else {
            normalizedLateralVector = new ui.Vector(-dirVector.y / len, dirVector.x / len);

            trapezoidP0 = new ui.Point(
                startPoint.point.x + widthAtStart * normalizedLateralVector.x,
                startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP1 = new ui.Point(
                startPoint.point.x - widthAtStart * normalizedLateralVector.x,
                startPoint.point.y - widthAtStart * normalizedLateralVector.y);

            trapezoidP2 = new ui.Point(
                endPoint.point.x - widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
            trapezoidP3 = new ui.Point(
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
}
