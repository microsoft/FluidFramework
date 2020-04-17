/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import * as ink from "@microsoft/fluid-ink";
import * as ui from "../ui";
import { getShapes } from "./canvasCommon";
import * as recognizer from "./shapeRecognizer";

export enum SegmentCircleInclusive {
    None,
    Both,
    Start,
    End,
}

// Padding around a drawing context - used to avoid extra copies
const CanvasPadding = 100;

/**
 * Helper method to resize a HTML5 canvas
 */
function sizeCanvas(canvas: HTMLCanvasElement, size: ui.ISize) {
    canvas.width = size.width;
    canvas.style.width = `${size.width}px`;
    canvas.height = size.height;
    canvas.style.height = `${size.height}px`;
}

/**
 * Adds padding to next if is different from the current value
 */
// eslint-disable-next-line max-len
const padLeft = (current: number, next: number, padding: number) => current !== next ? Math.floor(next - padding) : current;

/**
 * Adds padding to next if is different from the current value
 */
// eslint-disable-next-line max-len
const padRight = (current: number, next: number, padding: number) => current !== next ? Math.ceil(next + padding) : current;

/**
 * The drawing context provides access to a logical canvas that is infinite in size. In reality it's backed by a
 * fixed size canvas that fits all instructions sent to it.
 *
 * TODO: Not quite a DrawingContext in the traditional sense but close. Probably should rename or move into the
 * layer and expose more traditional getContext like calls.
 */
export class DrawingContext {
    public canvas = document.createElement("canvas");
    private context: CanvasRenderingContext2D;
    private lastPoint: ink.IInkPoint = null;
    private pen: ink.IPen;
    private canvasOffset: ui.IPoint = { x: 0, y: 0 };

    public get offset(): ui.IPoint {
        return this.canvasOffset;
    }

    constructor(size?: ui.ISize) {
        this.context = this.canvas.getContext("2d");
        if (size) {
            sizeCanvas(this.canvas, size);
        }
        this.updatePosition();
    }

    public clear() {
        this.lastPoint = null;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    public startNewStroke(pen: ink.IPen) {
        this.pen = pen;
        this.lastPoint = null;
    }

    // Store instructions used to render itself? i.e. the total path? Or defer to someone else to actually
    // do the re-render with a context?
    public drawSegmentToNewPoint(endPoint: ink.IInkPoint) {
        assert(this.pen);

        const previous = this.lastPoint || endPoint;
        const shapes = getShapes(previous, endPoint, this.pen, SegmentCircleInclusive.End);

        if (shapes) {
            // Update canvas bounds
            let unionedBounds: ui.Rectangle;
            for (const shape of shapes) {
                const bounds = shape.getBounds();
                if (!unionedBounds) {
                    unionedBounds = bounds;
                } else {
                    unionedBounds = unionedBounds.union(bounds);
                }
            }

            this.ensureCanvas(unionedBounds);

            this.context.fillStyle = ui.toColorStringNoAlpha(this.pen.color);
            for (const shape of shapes) {
                this.context.beginPath();
                shape.render(this.context, this.offset);
                this.context.closePath();
                this.context.fill();
            }
        }

        this.lastPoint = endPoint;
    }

    /**
     * Updates the positioning of the canvas so that the logical (0, 0) is at pixel (0, 0)
     */
    private updatePosition() {
        this.canvas.style.position = "relative";
        this.canvas.style.left = `${this.offset.x}px`;
        this.canvas.style.top = `${this.offset.y}px`;
    }

    /**
     * Ensures that the canvas is large enough to render the given bounds
     */
    private ensureCanvas(bounds: ui.Rectangle) {
        const canvasBounds = new ui.Rectangle(this.offset.x, this.offset.y, this.canvas.width, this.canvas.height);
        if (canvasBounds.contains(bounds)) {
            return;
        }

        const newBounds = canvasBounds.union(bounds);

        // Capture the max values of both prior to adjusting the min
        const canvasMax = { x: newBounds.x + newBounds.width, y: newBounds.y + newBounds.height };
        const newMax = { x: newBounds.x + newBounds.width, y: newBounds.y + newBounds.height };

        // Update the min values
        newBounds.x = padLeft(canvasBounds.x, newBounds.x, CanvasPadding);
        newBounds.y = padLeft(canvasBounds.y, newBounds.y, CanvasPadding);

        // Update the max values - and then width/height
        newMax.x = padRight(canvasMax.x, newMax.x, CanvasPadding);
        newMax.y = padRight(canvasMax.y, newMax.y, CanvasPadding);
        newBounds.width = newMax.x - newBounds.x;
        newBounds.height = newMax.y - newBounds.y;

        // Need to resize the canvas
        const newCanvas = document.createElement("canvas");
        sizeCanvas(newCanvas, newBounds.size);
        const newContext = newCanvas.getContext("2d");
        newContext.drawImage(this.canvas, this.offset.x - newBounds.x, this.offset.y - newBounds.y);

        // Swap the canvas elements
        if (this.canvas.parentNode) {
            this.canvas.parentNode.insertBefore(newCanvas, this.canvas);
            this.canvas.remove();
        }

        this.canvas = newCanvas;
        this.context = newContext;
        this.canvasOffset = { x: newBounds.x, y: newBounds.y };

        this.updatePosition();
    }

}

/**
 * Graphics drawing layer
 */
export abstract class Layer {
    public position: ui.IPoint = { x: 0, y: 0 };
    public node = document.createElement("div");
    public drawingContext = new DrawingContext();

    constructor(size: ui.ISize) {
        this.node.appendChild(this.drawingContext.canvas);
        this.updatePosition();
    }

    public setPosition(position: ui.IPoint) {
        this.position = position;
        this.updatePosition();
    }

    private updatePosition() {
        this.node.style.position = "absolute";
        this.node.style.left = `${this.position.x}px`;
        this.node.style.top = `${this.position.y}px`;
    }
}

/**
 * Used to render ink
 */
export class InkLayer extends Layer {
    constructor(size: ui.ISize, private readonly model: ink.IInk) {
        super(size);

        this.model.on("clear", () => {
            throw new Error("Clear not supported in OverlayCanvas");
        });

        this.model.on("stylus", (op) => {
            this.model.getStroke(op.id);
            this.drawingContext.drawSegmentToNewPoint(op.point);
        });

        const strokes = this.model.getStrokes();
        for (const stroke of strokes) {
            this.drawingContext.startNewStroke(stroke.pen);
            for (const point of stroke.points) {
                this.drawingContext.drawSegmentToNewPoint(point);
            }
        }
    }

    public createStroke(pen: ink.IPen) {
        this.drawingContext.startNewStroke(pen);
        return this.model.createStroke(pen);
    }

    public updateStroke(point: ink.IInkPoint, strokeId: string) {
        return this.model.appendPointToStroke(point, strokeId);
    }
}

/**
 * API access to a drawing context that can be used to render elements
 */
export class OverlayCanvas extends ui.Component {
    private readonly layers: Layer[] = [];
    private currentStrokeId: string;
    private activePointerId: number;
    private inkEventsEnabled = false;
    private penHovering = false;
    private forceInk = false;
    private activePen: ink.IPen = {
        color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
        thickness: 7,
    };
    private activeLayer: InkLayer;
    private pointsToRecognize: ui.IPoint[] = [];

    // TODO composite layers together
    // private canvas: HTMLCanvasElement;

    /**
     * Constructs a new OverlayCanvas.
     *
     * We require the parent element so we can register for entry/exit events on it. To allow non-ink
     * events to pass through the overlay we need to disable it when the pen is not being used. But once
     * disabled we won't receive the event to enable it. We can't wrap the canvas with a div either because
     * that element would then receive all events and events wouldn't pass through to the content under the
     * overlay. For that reason we ask the parent element to provide a div we can use to track pen entry/exit.
     */
    constructor(private readonly document: api.Document, container: HTMLDivElement, eventTarget: HTMLDivElement) {
        super(container);

        // No pointer events by default
        container.style.pointerEvents = "none";

        // Track ink events on the eventTarget in order to enable/disable pointer events
        this.trackInkEvents(eventTarget);

        // Ink handling messages
        container.addEventListener("pointerdown", this.handlePointerDown.bind(this));
        container.addEventListener("pointermove", this.handlePointerMove.bind(this));
        container.addEventListener("pointerup", this.handlePointerUp.bind(this));
    }

    public addLayer(layer: Layer) {
        this.layers.push(layer);
        this.element.appendChild(layer.node);
    }

    public removeLayer(layer: Layer) {
        const index = this.layers.indexOf(layer);
        this.layers.splice(index, 1);
        layer.node.remove();
    }

    /**
     * Sets the current pen
     */
    public setPen(pen: ink.IPen) {
        this.activePen = { color: pen.color, thickness: pen.thickness };
    }

    public enableInk(enable: boolean) {
        this.enableInkCore(this.penHovering, enable);
    }

    /**
     * Used to just enable/disable the ink events. Should only be used when needing to temporarily
     * disable ink (for DOM hit testing events, for example). The enableInk event is probably what you really want.
     */
    public enableInkHitTest(enable: boolean) {
        this.element.style.pointerEvents = enable ? "auto" : "none";
    }

    /**
     * Tracks ink events on the provided element and enables/disables the ink layer based on them
     */
    private trackInkEvents(eventTarget: HTMLDivElement) {
        // Pointer events used to enable/disable the overlay canvas ink handling
        // A pen entering the element causes us to enable ink events. If the pointer already has entered
        // via the mouse we won't get another event for the pen. In this case we also watch move events
        // to be able to toggle the ink layer. A pen leaving disables ink.

        eventTarget.addEventListener("pointerenter", (event) => {
            if (event.pointerType === "pen") {
                this.enableInkCore(true, this.forceInk);
            }
        });

        eventTarget.addEventListener("pointerleave", (event) => {
            if (event.pointerType === "pen") {
                this.enableInkCore(false, this.forceInk);
            }
        });

        // Tracking pointermove is used to work around not receiving a pen event if the mouse already
        // entered the element without leaving
        eventTarget.addEventListener("pointermove", (event) => {
            if (event.pointerType === "pen") {
                this.enableInkCore(true, this.forceInk);
            }
        });
    }

    /**
     * Updates the hovering and force fields and then enables or disables ink based on their values.
     */
    private enableInkCore(hovering: boolean, force: boolean) {
        this.penHovering = hovering;
        this.forceInk = force;

        const enable = this.forceInk || this.penHovering;
        if (this.inkEventsEnabled !== enable) {
            this.inkEventsEnabled = enable;
            this.enableInkHitTest(enable);
        }
    }

    private handlePointerDown(evt: PointerEvent) {
        // Only support pen events
        if (evt.pointerType === "pen" || (evt.pointerType === "mouse" && evt.button === 0)) {
            const translatedPoint = this.translatePoint(this.element, evt);
            this.pointsToRecognize.push(translatedPoint);

            // Create a new layer if doesn't already exist
            if (!this.activeLayer) {
                // Create a new layer at the position of the pointer down
                const model = this.document.createInk();
                this.activeLayer = new InkLayer({ width: 0, height: 0 }, model);
                this.activeLayer.setPosition(translatedPoint);
                this.addLayer(this.activeLayer);
                this.emit("ink", this.activeLayer, model, { x: evt.pageX, y: evt.pageY });
            }

            // Capture ink events
            this.activePointerId = evt.pointerId;
            this.element.setPointerCapture(this.activePointerId);

            this.currentStrokeId = this.activeLayer.createStroke(this.activePen).id;
            const layerTranslatedPoint = this.translateToLayer(translatedPoint, this.activeLayer);
            const inkPoint: ink.IInkPoint = {
                x: layerTranslatedPoint.x,
                y: layerTranslatedPoint.y,
                time: Date.now(),
                pressure: evt.pressure,
            };
            this.activeLayer.updateStroke(inkPoint, this.currentStrokeId);

            evt.preventDefault();
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            const translatedPoint = this.translatePoint(this.element, evt);
            this.pointsToRecognize.push(translatedPoint);
            const layerTranslatedPoint = this.translateToLayer(translatedPoint, this.activeLayer);
            const inkPoint: ink.IInkPoint = {
                x: layerTranslatedPoint.x,
                y: layerTranslatedPoint.y,
                time: Date.now(),
                pressure: evt.pressure,
            };
            this.activeLayer.updateStroke(inkPoint, this.currentStrokeId);

            evt.preventDefault();
        }
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            const translatedPoint = this.translatePoint(this.element, evt);
            this.pointsToRecognize.push(translatedPoint);
            const layerTranslatedPoint = this.translateToLayer(translatedPoint, this.activeLayer);
            const inkPoint: ink.IInkPoint = {
                x: layerTranslatedPoint.x,
                y: layerTranslatedPoint.y,
                time: Date.now(),
                pressure: evt.pressure,
            };
            this.activeLayer.updateStroke(inkPoint, this.currentStrokeId);

            this.currentStrokeId = undefined;

            // Release the event
            this.element.releasePointerCapture(this.activePointerId);
            this.activePointerId = undefined;

            this.recognizeShape();

            evt.preventDefault();
        }
    }

    private recognizeShape() {
        // The console output can be used to train more shapes.
        // console.log(this.printStroke());

        const shapeType = recognizer.recognizeShape(this.pointsToRecognize);
        if (shapeType !== undefined) {
            console.log(`Shape type: ${shapeType.pattern}`);
            console.log(`Score: ${shapeType.score}`);
        } else {
            console.log(`Unrecognized shape!`);
        }
        // Clear the strokes.
        this.pointsToRecognize = [];
    }

    private translatePoint(relative: HTMLElement, event: PointerEvent): ui.IPoint {
        const boundingRect = relative.getBoundingClientRect();
        const offset = {
            x: boundingRect.left + document.body.scrollLeft,
            y: boundingRect.top + document.body.scrollTop,
        };

        return {
            x: event.pageX - offset.x,
            y: event.pageY - offset.y,
        };
    }

    private translateToLayer(position: ui.IPoint, layer: Layer): ui.IPoint {
        return {
            x: position.x - layer.position.x,
            y: position.y - layer.position.y,
        };
    }

    /*// Returns a stroke in training format.
    private printStroke(): string {
        let stroke = "points: [";
        for (let point of this.pointsToRecognize) {
            stroke += `{ x: ${point.x}, y: ${point.y} }, `;
        }
        stroke = stroke.slice(0, -2);
        stroke += "]";
        return stroke;
    }*/
}
