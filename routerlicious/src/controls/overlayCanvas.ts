import * as assert from "assert";
import * as $ from "jquery";
import * as _ from "lodash";
import * as api from "../api";
import * as ink from "../ink";
import * as ui from "../ui";
import { debug } from "./debug";
import { Circle, IShape, Polygon } from "./shapes/index";

export enum SegmentCircleInclusive {
    None,
    Both,
    Start,
    End,
}

const DryTimer = 5000;

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
function padLeft(current: number, next: number, padding: number) {
    return current !== next ? Math.floor(next - padding) : current;
}

/**
 * Adds padding to next if is different from the current value
 */
function padRight(current: number, next: number, padding: number) {
    return current !== next ? Math.ceil(next + padding) : current;
}

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
    private lastOperation: ink.IOperation = null;
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
        this.lastOperation = null;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // store instructions used to render itself? i.e. the total path? Or defer to someone else to actually
    // do the re-render with a context?
    public drawStroke(current: ink.IOperation) {
        let type = ink.getActionType(current);
        let shapes: IShape[];

        let currentAction = ink.getStylusAction(current);
        let previousAction = ink.getStylusAction(this.lastOperation || current);

        switch (type) {
            case ink.ActionType.StylusDown:
                this.pen = current.stylusDown.pen;
                shapes = this.getShapes(currentAction, currentAction, this.pen, SegmentCircleInclusive.End);
                break;

            case ink.ActionType.StylusMove:
                assert(this.pen);
                shapes = this.getShapes(previousAction, currentAction, this.pen, SegmentCircleInclusive.End);
                break;

            case ink.ActionType.StylusUp:
                assert(this.pen);
                shapes = this.getShapes(previousAction, currentAction, this.pen, SegmentCircleInclusive.End);
                break;

            default:
                break;
        }

        if (shapes) {
            // Update canvas bounds
            let unionedBounds: ui.Rectangle;
            for (let shape of shapes) {
                const bounds = shape.getBounds();
                if (!unionedBounds) {
                    unionedBounds = bounds;
                } else {
                    unionedBounds = unionedBounds.union(bounds);
                }
            }

            this.ensureCanvas(unionedBounds);

            this.context.fillStyle = ui.toColorStringNoAlpha(this.pen.color);
            for (let shape of shapes) {
                this.context.beginPath();
                shape.render(this.context, this.offset);
                this.context.closePath();
                this.context.fill();
            }
        }

        this.lastOperation = current;
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

    /**
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

        let dirVector = new ui.Vector(
            endPoint.point.x - startPoint.point.x,
            endPoint.point.y - startPoint.point.y);
        let len = dirVector.length();

        let shapes = new Array<IShape>();
        let trapezoidP0: ui.IPoint;
        let trapezoidP1: ui.IPoint;
        let trapezoidP2: ui.IPoint;
        let trapezoidP3: ui.IPoint;
        let normalizedLateralVector: ui.IVector;

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

/**
 * Graphics drawing layer
 */
export abstract class Layer {
    public position: ui.IPoint = { x: 0, y: 0 };
    public node = document.createElement("div");
    public drawingContext = new DrawingContext();
    private size: ui.ISize;

    constructor(size: ui.ISize) {
        this.size = _.clone(size);
        this.node.appendChild(this.drawingContext.canvas);
        this.updatePosition();
    }

    public setSize(size: ui.ISize) {
        this.size = { width: size.width, height: size.height };
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
    constructor(size: ui.ISize, private model: ink.IInk) {
        super(size);

        // Listen for updates and re-render
        this.model.on("op", (op) => {
            const delta = op.contents as ink.IDelta;
            for (const operation of delta.operations) {
                this.drawingContext.drawStroke(operation);
            }
        });

        const layers = this.model.getLayers();
        for (const layer of layers) {
            for (const operation of layer.operations) {
                this.drawingContext.drawStroke(operation);
            }
        }
    }

    public drawDelta(delta: ink.IDelta) {
        this.model.submitOp(delta);
        for (const operation of delta.operations) {
            this.drawingContext.drawStroke(operation);
        }
    }
}

/**
 * API access to a drawing context that can be used to render elements
 */
export class OverlayCanvas extends ui.Component {
    private layers: Layer[] = [];
    private currentStylusActionId: string;
    private dryTimer: NodeJS.Timer;
    private activePointerId: number;
    private inkEventsEnabled = false;
    private penHovering = false;
    private forceInk = false;
    private activePen: ink.IPen = {
        color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
        thickness: 7,
    };
    private activeLayer: InkLayer;

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
    constructor(private document: api.Document, container: HTMLDivElement, eventTarget: HTMLDivElement) {
        super(container);

        // No pointer events by default
        container.style.pointerEvents = "none";

        // Track ink events on the eventTarget in order to enable/disable pointer events
        this.trackInkEvents(eventTarget);

        // Ink handling messages
        container.addEventListener("pointerdown", (evt) => this.handlePointerDown(evt));
        container.addEventListener("pointermove", (evt) => this.handlePointerMove(evt));
        container.addEventListener("pointerup", (evt) => this.handlePointerUp(evt));
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
        this.activePen = _.clone(pen);
    }

    public enableInk(enable: boolean) {
        this.enableInkCore(this.penHovering, enable);
    }

    public isDrawLayer(layer: Layer) {
        return this.activeLayer === layer;
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
            this.element.style.pointerEvents = enable ? "auto" : "none";
        }
    }

    private handlePointerDown(evt: PointerEvent) {
        // Only support pen events
        if (evt.pointerType === "pen" || (evt.pointerType === "mouse" && evt.button === 0)) {
            let translatedPoint = this.translatePoint(this.element, evt);

            // Create a new layer if doesn't already exist
            if (!this.activeLayer) {
                // Create a new layer at the position of the pointer down
                const model = this.document.createInk();
                this.activeLayer = new InkLayer({ width: 0, height: 0 }, model);
                this.activeLayer.setPosition(translatedPoint);
                this.addLayer(this.activeLayer);
                this.emit("ink", this.activeLayer, model, evt);
            }

            this.stopDryTimer();

            // Capture ink events
            this.activePointerId = evt.pointerId;
            this.element.setPointerCapture(this.activePointerId);

            let delta = new ink.Delta().stylusDown(
                this.translateToLayer(translatedPoint, this.activeLayer),
                evt.pressure,
                this.activePen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.activeLayer.drawDelta(delta);

            evt.returnValue = false;
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            let translatedPoint = this.translatePoint(this.element, evt);
            let delta = new ink.Delta().stylusMove(
                this.translateToLayer(translatedPoint, this.activeLayer),
                evt.pressure,
                this.currentStylusActionId);
            this.activeLayer.drawDelta(delta);

            evt.returnValue = false;
        }

        return false;
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            let translatedPoint = this.translatePoint(this.element, evt);
            evt.returnValue = false;

            let delta = new ink.Delta().stylusUp(
                this.translateToLayer(translatedPoint, this.activeLayer),
                evt.pressure,
                this.currentStylusActionId);
            this.currentStylusActionId = undefined;

            this.activeLayer.drawDelta(delta);

            // Release the event
            this.element.releasePointerCapture(this.activePointerId);
            this.activePointerId = undefined;

            this.startDryTimer();
        }

        return false;
    }

    private startDryTimer() {
        this.dryTimer = setTimeout(
            () => {
                this.dryInk();
            },
            DryTimer);
    }

    private stopDryTimer() {
        if (this.dryTimer) {
            clearTimeout(this.dryTimer);
            this.dryTimer = undefined;
        }
    }

    private dryInk() {
        debug("Drying the ink");
        this.dryTimer = undefined;
        // TODO allow ability to close a collab stream
        this.emit("dry", this.activeLayer);
        this.activeLayer = undefined;
    }

    private translatePoint(relative: HTMLElement, event: PointerEvent): ui.IPoint {
        let offset = $(relative).offset();
        return {
            x: event.pageX - offset.left,
            y: event.pageY - offset.top,
        };
    }

    private translateToLayer(position: ui.IPoint, layer: Layer): ui.IPoint {
        return {
            x: position.x - layer.position.x,
            y: position.y - layer.position.y,
        };
    }
}
