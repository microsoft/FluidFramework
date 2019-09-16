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

        this.model.on("op", (op) => {
            // Update the canvas
            this.submitAndApplyOp(op.contents, false);
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

    public setPenColor(color: ink.IColor) {
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
        const operation = ink.Ink.makeClearOperation();
        this.submitAndApplyOp(operation, true);
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
            const createOp = ink.Ink.makeCreateStrokeOperation(this.currentPen);
            this.currentStrokeId = createOp.id;
            this.submitAndApplyOp(createOp, true);

            // Set pen state to be used during this active stroke
            this.penID = evt.pointerId;
            this.currentStrokeId = createOp.id;

            this.appendPointerEventToCurrentStroke(evt);

            evt.returnValue = false;
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            this.appendPointerEventToCurrentStroke(evt);

            evt.returnValue = false;
        }

        return false;
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            this.appendPointerEventToCurrentStroke(evt);

            // Reset pen state, no more active stroke
            this.penID = -1;
            this.currentStrokeId = undefined;

            evt.returnValue = false;
        }

        return false;
    }

    private appendPointerEventToCurrentStroke(evt: PointerEvent) {
        const pt = new EventPoint(this.canvas, evt);
        const operation = ink.Ink.makeStylusOperation(
            pt.rawPosition,
            evt.pressure,
            this.currentStrokeId,
        );
        this.submitAndApplyOp(operation, true);
    }

    private animateStroke(stroke: ink.IInkStroke, operationIndex: number, startTime: number) {
        if (operationIndex >= stroke.operations.length) {
            return;
        }

        // Draw the requested stroke
        const current = stroke.operations[operationIndex];
        const previous = stroke.operations[Math.max(0, operationIndex - 1)];
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
            let previous = stroke.operations[0];
            for (const current of stroke.operations) {
                // current === previous === stroke.operations[0] for the down
                this.drawStroke(stroke, current, previous);
                previous = current;
            }
        }
    }

    private drawStroke(
        stroke: ink.IInkStroke,
        current: ink.IStylusOperation,
        previous: ink.IStylusOperation,
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

    private submitAndApplyOp(operation: ink.IInkOperation, submit: boolean) {
        if (submit) {
            this.model.submitOperation(operation);
        }

        if (operation.type === "clear") {
            this.handleClearOp();
        } else if (operation.type === "stylus") {
            this.handleStylusOp(operation);
        }
    }

    private handleClearOp() {
        this.clearCanvas();
        this.lastStrokeRenderOp = {};
    }

    private handleStylusOp(operation: ink.IStylusOperation) {
        // Render the dirty stroke
        const dirtyStrokeId = operation.id;
        let index = this.lastStrokeRenderOp[dirtyStrokeId] ? this.lastStrokeRenderOp[dirtyStrokeId] : 0;

        const stroke = this.model.getStroke(dirtyStrokeId);
        for (; index < stroke.operations.length; index++) {
            // render the stroke
            this.drawStroke(stroke, stroke.operations[index], stroke.operations[Math.max(0, index - 1)]);
        }

        this.lastStrokeRenderOp[dirtyStrokeId] = index;
    }
}
