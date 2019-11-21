/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ink from "@microsoft/fluid-ink";
import * as ui from "../ui";
import { getShapes } from "./canvasCommon";
import { Image } from "./image";
import { SegmentCircleInclusive } from "./overlayCanvas";
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
    private currentStrokeId: string;
    private currentPen: ink.IPen;
    private lastStrokeRenderOp: { [key: string]: number } = {};

    // constructor
    constructor(element: HTMLDivElement, private model: ink.IInk, private image?: CanvasImageSource) {
        super(element);

        this.model.on("load", () => {
            this.redraw();
        });

        this.model.on("clear", this.handleClear.bind(this));
        this.model.on("stylus", this.handleStylus.bind(this));

        // setup canvas
        this.canvasWrapper = document.createElement("div");
        this.canvasWrapper.classList.add("drawSurface");
        this.canvas = document.createElement("canvas");
        this.canvasWrapper.appendChild(this.canvas);
        element.appendChild(this.canvasWrapper);

        // get context
        this.context = this.canvas.getContext("2d");

        this.canvas.addEventListener("pointerdown", this.handlePointerDown.bind(this));
        this.canvas.addEventListener("pointermove", this.handlePointerMove.bind(this));
        this.canvas.addEventListener("pointerup", this.handlePointerUp.bind(this));

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

    public setPenColor(color: ink.IColor) {
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

    public addPhoto(image: Image) {
        this.addChild(image);
        this.element.appendChild(image.element);
    }

    public addVideo(video: Video) {
        this.addChild(video);
        this.element.appendChild(video.element);
    }

    public clear() {
        this.model.clear();
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
    private handlePointerDown(evt: PointerEvent) {
        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Create a new stroke
            this.currentStrokeId = this.model.createStroke(this.currentPen).id;

            // Set pen state to be used during this active stroke
            this.penID = evt.pointerId;

            this.appendPointerEventToCurrentStroke(evt);

            evt.preventDefault();
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            this.appendPointerEventToCurrentStroke(evt);

            evt.preventDefault();
        }

        return false;
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            this.appendPointerEventToCurrentStroke(evt);

            // Reset pen state, no more active stroke
            this.penID = -1;
            this.currentStrokeId = undefined;

            evt.preventDefault();
        }

        return false;
    }

    private appendPointerEventToCurrentStroke(evt: PointerEvent) {
        const pt = new EventPoint(this.canvas, evt);
        const inkPt = {
            x: pt.rawPosition.x,
            y: pt.rawPosition.y,
            time: Date.now(),
            pressure: evt.pressure,
        };
        this.model.appendPointToStroke(inkPt, this.currentStrokeId);
    }

    private animateStroke(stroke: ink.IInkStroke, operationIndex: number, startTime: number) {
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
            this.drawStroke(stroke, current, previous);
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
            let previous = stroke.points[0];
            for (const current of stroke.points) {
                // current === previous === stroke.operations[0] for the down
                this.drawStroke(stroke, current, previous);
                previous = current;
            }
        }
    }

    private drawStroke(
        stroke: ink.IInkStroke,
        current: ink.IInkPoint,
        previous: ink.IInkPoint,
    ) {
        const pen = stroke.pen;
        const shapes = getShapes(previous, current, pen, SegmentCircleInclusive.End);

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

    private handleClear() {
        this.clearCanvas();
        this.lastStrokeRenderOp = {};
    }

    private handleStylus(operation: ink.IStylusOperation) {
        // Render the dirty stroke
        const dirtyStrokeId = operation.id;
        let index = this.lastStrokeRenderOp[dirtyStrokeId] ? this.lastStrokeRenderOp[dirtyStrokeId] : 0;

        const stroke = this.model.getStroke(dirtyStrokeId);
        for (; index < stroke.points.length; index++) {
            // render the stroke
            this.drawStroke(stroke, stroke.points[index], stroke.points[Math.max(0, index - 1)]);
        }

        this.lastStrokeRenderOp[dirtyStrokeId] = index;
    }
}
