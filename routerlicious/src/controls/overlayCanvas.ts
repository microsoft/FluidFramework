import * as assert from "assert";
import * as $ from "jquery";
import * as _ from "lodash";
import * as ink from "../ink";
import * as ui from "../ui";
import { Circle, IShape, Polygon } from "./shapes/index";

export enum SegmentCircleInclusive {
    None,
    Both,
    Start,
    End,
}

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
    private activePointerId: number;
    private activePen: ink.IPen = {
        color: { r: 0, g: 161 / 255, b: 241 / 255, a: 0 },
        thickness: 7,
    };

    // TODO composite layers together
    // private canvas: HTMLCanvasElement;

    constructor(container: HTMLDivElement) {
        super(container);
        this.inkLayer = new InkLayer({ width: 0, height: 0 }, []);
        this.addLayer(this.inkLayer);

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

    protected resizeCore(rectangle: ui.Rectangle) {
        this.inkLayer.setSize(rectangle.size);
        this.markDirty();
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
        this.activePointerId = evt.pointerId;

        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Anchor and clear any current selection.
            let translatedPoint = this.translatePoint(this.element, evt);

            let delta = new ink.Delta().stylusDown(
                translatedPoint,
                evt.pressure,
                this.activePen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.inkLayer.drawStroke(delta.operations[0]);

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
            this.inkLayer.drawStroke(delta.operations[0]);

            evt.returnValue = false;
        }

        return false;
    }

    private handlePointerUp(evt: PointerEvent) {
        if (evt.pointerId === this.activePointerId) {
            this.activePointerId = undefined;
            let translatedPoint = this.translatePoint(this.element, evt);
            evt.returnValue = false;

            let delta = new ink.Delta().stylusUp(
                translatedPoint,
                evt.pressure,
                this.currentStylusActionId);
            this.currentStylusActionId = undefined;

            this.inkLayer.drawStroke(delta.operations[0]);
        }

        return false;
    }

    private translatePoint(relative: HTMLElement, event: PointerEvent): ui.IPoint {
        let offset = $(relative).offset();
        return {
            x: event.pageX - offset.left,
            y: event.pageY - offset.top,
        };
    }
}
