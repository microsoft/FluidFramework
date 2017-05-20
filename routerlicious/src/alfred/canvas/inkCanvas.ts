// This one is where a lot is going to happen

import * as ink from "../../ink";
import * as geometry from "./geometry/index";
import { Circle, IShape, Polygon } from "./shapes/index";
import * as utils from "./utils";

// There's an issue with the d.ts files and the default export
// tslint:disable-next-line:no-var-requires
let ResizeObserver = require("resize-observer-polyfill");

// TODO split classes into separate files
// tslint:disable:max-classes-per-file

export enum SegmentCircleInclusive {
    None,
    Both,
    Start,
    End,
}

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
        let offset = $(relative).offset();
        this.rawPosition = {
            x: evt.pageX - offset.left,
            y: evt.pageY - offset.top,
        };
        this.properties = { isEraser: false };
    }
}

export default class InkCanvas {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private penID: number = -1;
    private canvasWrapper: HTMLElement;
    private currentStylusActionId: string;
    private currentPen: ink.IPen;
    private lastLayerRenderOp: { [key: string]: number } = {};

    // constructor
    constructor(private model: ink.IInk, parent: HTMLElement, private entryTarget: HTMLElement = null) {
        this.model.on("op", (op, isLocal) => {
            if (isLocal) {
                return;
            }

            // Update the canvas
            this.addAndDrawStroke(op as ink.IDelta, false);
        });

        this.model.on("load", () => {
            this.redraw();
        });

        // setup canvas
        this.canvasWrapper = document.createElement("div");
        this.canvasWrapper.classList.add("drawSurface");
        this.canvasWrapper.style.pointerEvents = entryTarget ? "none" : "auto";
        this.canvas = document.createElement("canvas");
        this.canvasWrapper.appendChild(this.canvas);
        parent.appendChild(this.canvasWrapper);

        // get context
        this.context = this.canvas.getContext("2d");

        let bb = false;
        this.canvas.addEventListener("pointerdown", (evt) => this.handlePointerDown(evt), bb);
        this.canvas.addEventListener("pointermove", (evt) => this.handlePointerMove(evt), bb);
        this.canvas.addEventListener("pointerup", (evt) => this.handlePointerUp(evt), bb);

        // Listen for enter/leave on the entry target if available
        if (this.entryTarget) {
            this.entryTarget.addEventListener("pointerenter", (evt) => this.handlePointerEnter(evt), bb);
            this.entryTarget.addEventListener("pointerleave", (evt) => this.handlePointerLeave(evt), bb);
        }

        this.currentPen = {
            color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
            thickness: 7,
        };

        // Throttle the canvas resizes at animation frame frequency
        // TODO the resize event fires slightly after the resize happens causing possible
        // rendering tearing. We probably want to oversize the canvas and clip it.
        let throttler = new utils.AnimationFrameThrottler(() => {
            this.resize(this.canvasWrapper.offsetWidth, this.canvasWrapper.offsetHeight);
        });

        // Listen for resize events and update the canvas dimensions accordingly
        new ResizeObserver((entries, obs) => {
            throttler.trigger();
        }).observe(this.canvasWrapper);
    }

    public setPenColor(color: ink.IColor) {
        this.currentPen.color = color;
    }

    // tslint:disable:no-empty
    // Stubs for bunch of functions that are being called in the code below
    // this will make it easier to fill some code in later or just delete them

    public tempEraseMode() {
    }

    public restoreMode() {
    }

    public anchorSelection() {
    }

    public inkMode() {
    }

    public inkColor() {
    }

    public undo() {
    }

    public redo() {
    }

    // tslint:enable:no-empty

    public anySelected(): boolean {
        return false;
    }

    public handleTap(evt) {
        // Anchor and clear any current selection.
        if (this.anySelected()) {
            this.anchorSelection();
        }
        return false;
    }

    public clear() {
        if (!this.anySelected()) {
            this.inkMode();
        }

        let delta = new ink.Delta().clear();
        this.addAndDrawStroke(delta, true);
    }

    public replay() {
        this.clearCanvas();

        const layers = this.model.getLayers();

        // Time of the first operation in layer 0 is our starting time
        let startTime = layers[0].operations[0].time;
        for (let layer of layers) {
            this.animateLayer(layer, 0, startTime);
        }
    }

    // We will accept pen down or mouse left down as the start of a stroke.
    // We will accept touch down or mouse right down as the start of a touch.
    private handlePointerDown(evt: PointerEvent) {
        this.penID = evt.pointerId;

        if (evt.pointerType === "touch") {
            // ic.gesture.addPointer(evt.pointerId);
        }

        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Anchor and clear any current selection.
            this.anchorSelection();
            let pt = new EventPoint(this.canvas, evt);

            if (pt.properties.isEraser) { // The back side of a pen, which we treat as an eraser
                this.tempEraseMode();
            } else {
                this.restoreMode();
            }

            let delta = new ink.Delta().stylusDown(pt.rawPosition, evt.pressure, this.currentPen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.addAndDrawStroke(delta, true);

            evt.returnValue = false;
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            let pt = new EventPoint(this.canvas, evt);
            let delta = new ink.Delta().stylusMove(
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
            let pt = new EventPoint(this.canvas, evt);
            evt.returnValue = false;

            let delta = new ink.Delta().stylusUp(
                pt.rawPosition,
                evt.pressure,
                this.currentStylusActionId);
            this.currentStylusActionId = undefined;

            this.addAndDrawStroke(delta, true);
        }

        return false;
    }

    private handlePointerEnter(evt: PointerEvent) {
        if (evt.pointerType === "pen") {
            this.canvasWrapper.style.pointerEvents = "auto";
        }
    }

    private handlePointerLeave(evt: PointerEvent) {
        if (evt.pointerType === "pen") {
            this.canvasWrapper.style.pointerEvents = "none";
        }
    }

    private animateLayer(layer: ink.IInkLayer, operationIndex: number, startTime: number) {
        if (operationIndex >= layer.operations.length) {
            return;
        }

        // Draw the requested stroke
        let currentOperation = layer.operations[operationIndex];
        let previousOperation = layer.operations[Math.max(0, operationIndex - 1)];
        let time = operationIndex === 0
            ? currentOperation.time - startTime
            : currentOperation.time - previousOperation.time;

        setTimeout(() => {
            this.drawStroke(layer, currentOperation, previousOperation);
            this.animateLayer(layer, operationIndex + 1, startTime);
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

        const layers = this.model.getLayers();
        for (let layer of layers) {
            let previous: ink.IOperation = layer.operations[0];
            for (let operation of layer.operations) {
                this.drawStroke(layer, operation, previous);
                previous = operation;
            }
        }
    }

    private drawStroke(
        layer: ink.IInkLayer,
        current: ink.IOperation,
        previous: ink.IOperation) {
        let type = ink.getActionType(current);
        let shapes: IShape[];

        let currentAction = ink.getStylusAction(current);
        let previousAction = ink.getStylusAction(previous);
        let pen = layer.operations[0].stylusDown.pen;

        switch (type) {
            case ink.ActionType.StylusDown:
                shapes = this.getShapes(currentAction, currentAction, pen, SegmentCircleInclusive.End);
                break;

            case ink.ActionType.StylusMove:
                shapes = this.getShapes(previousAction, currentAction, pen, SegmentCircleInclusive.End);
                break;

            case ink.ActionType.StylusUp:
                shapes = this.getShapes(previousAction, currentAction, pen, SegmentCircleInclusive.End);
                break;

            default:
                break;
        }

        if (shapes) {
            this.context.fillStyle = utils.toColorStringNoAlpha(pen.color);
            for (let shape of shapes) {
                this.context.beginPath();
                shape.render(this.context);
                this.context.closePath();
                this.context.fill();
            }
        }
    }

    /**
     * Resizes the canvas
     */
    private resize(width: number, height: number) {
        // Updates the size of the canvas
        this.canvas.width = width;
        this.canvas.height = height;

        // And then redraw the canvas
        this.redraw();
    }

    private addAndDrawStroke(delta: ink.IDelta, submit: boolean) {
        if (submit) {
            this.model.submitOp(delta);
        }

        let dirtyLayers: { [key: string]: any } = {};
        for (let operation of delta.operations) {
            let type = ink.getActionType(operation);
            if (type === ink.ActionType.Clear) {
                this.clearCanvas();
                this.lastLayerRenderOp = {};
                dirtyLayers = {};
            } else {
                // Get the layer the delta applies to
                let stylusId = ink.getStylusId(operation);
                dirtyLayers[stylusId] = true;
            }
        }

        // Render all the dirty layers
        // tslint:disable-next-line:forin
        for (let id in dirtyLayers) {
            let index = this.lastLayerRenderOp[id] || 0;

            const layer = this.model.getLayer(id);
            for (; index < layer.operations.length; index++) {
                // render the stroke
                this.drawStroke(layer, layer.operations[index], layer.operations[Math.max(0, index - 1)]);
            }

            this.lastLayerRenderOp[id] = index;
        }
    }

    /***
     * given start point and end point, get MixInk shapes to render. The returned MixInk
     * shapes may contain one or two circles whose center is either start point or end point.
     * Enum SegmentCircleInclusive determins whether circle is in the return list.
     * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
     */
    private getShapes(
        startPoint: ink.IStylusAction,
        endPoint: ink.IStylusAction,
        pen: ink.IPen,
        circleInclusive: SegmentCircleInclusive): IShape[] {

        let dirVector = new geometry.Vector(
            endPoint.point.x - startPoint.point.x,
            endPoint.point.y - startPoint.point.y);
        let len = dirVector.length();

        let shapes = new Array<IShape>();
        let trapezoidP0: geometry.IPoint;
        let trapezoidP1: geometry.IPoint;
        let trapezoidP2: geometry.IPoint;
        let trapezoidP3: geometry.IPoint;
        let normalizedLateralVector: geometry.IVector;

        // Scale by a power curve to trend towards thicker values
        let widthAtStart = pen.thickness * Math.pow(startPoint.pressure, 0.5) / 2;
        let widthAtEnd = pen.thickness * Math.pow(endPoint.pressure, 0.5) / 2;

        // Just draws a circle on small values??
        if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
            let center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
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

            normalizedLateralVector = geometry.Vector.normalize(geometry.Vector.rotate(dirVector, -angle));
            trapezoidP0 = new geometry.Point(
                startPoint.point.x + widthAtStart * normalizedLateralVector.x,
                startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP3 = new geometry.Point(
                endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y + widthAtEnd * normalizedLateralVector.y);

            normalizedLateralVector = geometry.Vector.normalize(geometry.Vector.rotate(dirVector, angle));
            trapezoidP2 = new geometry.Point(
                endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
            trapezoidP1 = new geometry.Point(
                startPoint.point.x + widthAtStart * normalizedLateralVector.x,
                startPoint.point.y + widthAtStart * normalizedLateralVector.y);
        } else {
            normalizedLateralVector = new geometry.Vector(-dirVector.y / len, dirVector.x / len);

            trapezoidP0 = new geometry.Point(
                startPoint.point.x + widthAtStart * normalizedLateralVector.x,
                startPoint.point.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP1 = new geometry.Point(
                startPoint.point.x - widthAtStart * normalizedLateralVector.x,
                startPoint.point.y - widthAtStart * normalizedLateralVector.y);

            trapezoidP2 = new geometry.Point(
                endPoint.point.x - widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y - widthAtEnd * normalizedLateralVector.y);
            trapezoidP3 = new geometry.Point(
                endPoint.point.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.point.y + widthAtEnd * normalizedLateralVector.y);
        }

        let polygon = new Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
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
