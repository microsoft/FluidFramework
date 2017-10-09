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
 * Graphics drawing layer
 */
export abstract class Layer {
    public position: ui.IPoint = { x: 0, y: 0 };
    public canvas = document.createElement("canvas");
    protected context: CanvasRenderingContext2D;
    private size: ui.ISize;

    constructor(size: ui.ISize) {
        this.size = _.clone(size);
        this.context = this.canvas.getContext("2d");
        sizeCanvas(this.canvas, size);
    }

    public setSize(size: ui.ISize) {
        this.size = { width: size.width, height: size.height };
        sizeCanvas(this.canvas, size);
        this.clearCanvas();
        this.render();
    }

    public setPosition(position: ui.IPoint) {
        this.position = position;
    }

    // Do I want a pluggable render function here?
    protected abstract render();

    /**
     * Clears the given HTML canvas
     */
    private clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

/**
 * Used to render ink
 */
export class InkLayer extends Layer {
    private lastOperation: ink.IOperation = null;
    private pen: ink.IPen;

    // TODO I may actually want 'layers' in the ink layer to support multiple pens interacting with the canvas
    // at the same time

    constructor(size: ui.ISize, private operations: ink.IOperation[]) {
        super(size);
    }

    public drawStroke(current: ink.IOperation) {
        this.operations.push(current);
        this.drawStrokeCore(current);
    }

    /**
     * Renders the entire ink layer
     */
    protected render() {
        this.lastOperation = null;
        for (const operation of this.operations) {
            this.drawStrokeCore(operation);
        }
    }

    // store instructions used to render itself? i.e. the total path? Or defer to someone else to actually
    // do the re-render with a context?
    private drawStrokeCore(current: ink.IOperation) {
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
            this.context.fillStyle = ui.toColorStringNoAlpha(this.pen.color);
            for (let shape of shapes) {
                this.context.beginPath();
                shape.render(this.context);
                this.context.closePath();
                this.context.fill();
            }
        }

        this.lastOperation = current;
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
 * API access to a drawing context that can be used to render elements
 */
export class OverlayCanvas extends ui.Component {
    private throttler = new ui.AnimationFrameThrottler(() => this.render());
    private layers: Layer[] = [];
    private inkLayer: InkLayer;
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
    private activeLayer: ink.IInk;

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
        this.inkLayer = new InkLayer({ width: 0, height: 0 }, []);
        this.addLayer(this.inkLayer);

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
        this.markDirty();
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

    protected resizeCore(rectangle: ui.Rectangle) {
        this.inkLayer.setSize(rectangle.size);
        this.markDirty();
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

    /**
     * Marks the canvas dirty and triggers a render
     */
    private markDirty() {
        this.throttler.trigger();
    }

    private render() {
        // TODO
        // composite the layers together off of the animation clock
        // based on the type of layer optimize how exactly we render the overall canvas - i.e. do I split
        // things into multiple canvas divs or just use a single one
        ui.removeAllChildren(this.element);
        for (const layer of this.layers) {
            layer.canvas.style.position = "absolute";
            layer.canvas.style.left = `${layer.position.x}px`;
            layer.canvas.style.top = `${layer.position.y}px`;
            this.element.appendChild(layer.canvas);
        }
    }

    private handlePointerDown(evt: PointerEvent) {
        // Only support pen events
        if (evt.pointerType === "pen" || (evt.pointerType === "mouse" && evt.button === 0)) {
            // Create a new layer if doesn't already exist
            if (!this.activeLayer) {
                // Create a new layer and then emit it existing
                this.activeLayer = this.document.createInk();
                this.emit("ink", this.activeLayer, evt);
            }

            this.stopDryTimer();

            // Capture ink events
            this.activePointerId = evt.pointerId;
            this.element.setPointerCapture(this.activePointerId);

            // Anchor and clear any current selection.
            let translatedPoint = this.translatePoint(this.element, evt);

            let delta = new ink.Delta().stylusDown(
                translatedPoint,
                evt.pressure,
                this.activePen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.addAndDrawStroke(delta);

            evt.returnValue = false;
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            let translatedPoint = this.translatePoint(this.element, evt);
            let delta = new ink.Delta().stylusMove(
                translatedPoint,
                evt.pressure,
                this.currentStylusActionId);
            this.addAndDrawStroke(delta);

            evt.returnValue = false;
        }

        return false;
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            let translatedPoint = this.translatePoint(this.element, evt);
            evt.returnValue = false;

            let delta = new ink.Delta().stylusUp(
                translatedPoint,
                evt.pressure,
                this.currentStylusActionId);
            this.currentStylusActionId = undefined;

            this.addAndDrawStroke(delta);

            // Release the event
            this.element.releasePointerCapture(this.activePointerId);
            this.activePointerId = undefined;

            this.startDryTimer();
        }

        return false;
    }

    private addAndDrawStroke(delta: ink.Delta) {
        assert(this.activeLayer);
        this.activeLayer.submitOp(delta);
        this.inkLayer.drawStroke(delta.operations[0]);
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
}
