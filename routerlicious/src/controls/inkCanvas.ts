import { types } from "../client-api";
import * as ui from "../ui";
import { SegmentCircleInclusive } from "./overlayCanvas";
import { Circle, IShape, Polygon } from "./shapes/index";

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

export class InkCanvas extends ui.Component {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private penID: number = -1;
    private canvasWrapper: HTMLElement;
    private currentStylusActionId: string;
    private currentPen: types.IPen;
    private lastLayerRenderOp: { [key: string]: number } = {};

    // constructor
    constructor(element: HTMLDivElement, private model: types.IInk) {
        super(element);

        this.model.on("op", (op) => {
            // Update the canvas
            this.addAndDrawStroke(op.contents as types.IDelta, false);
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

        let bb = false;
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

    public setPenColor(color: types.IColor) {
        this.currentPen.color = color;
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
            let pt = new EventPoint(this.canvas, evt);

            let delta = new types.Delta().stylusDown(pt.rawPosition, evt.pressure, this.currentPen);
            this.currentStylusActionId = delta.operations[0].stylusDown.id;
            this.addAndDrawStroke(delta, true);

            evt.returnValue = false;
        }
    }

    private handlePointerMove(evt: PointerEvent) {
        if (evt.pointerId === this.penID) {
            let pt = new EventPoint(this.canvas, evt);
            let delta = new types.Delta().stylusMove(
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

            let delta = new types.Delta().stylusUp(
                pt.rawPosition,
                evt.pressure,
                this.currentStylusActionId);
            this.currentStylusActionId = undefined;

            this.addAndDrawStroke(delta, true);
        }

        return false;
    }

    private animateLayer(layer: types.IInkLayer, operationIndex: number, startTime: number) {
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
            let previous: types.IOperation = layer.operations[0];
            for (let operation of layer.operations) {
                this.drawStroke(layer, operation, previous);
                previous = operation;
            }
        }
    }

    private drawStroke(
        layer: types.IInkLayer,
        current: types.IOperation,
        previous: types.IOperation) {
        let type = types.getActionType(current);
        let shapes: IShape[];

        let currentAction = types.getStylusAction(current);
        let previousAction = types.getStylusAction(previous);
        let pen = layer.operations[0].stylusDown.pen;

        switch (type) {
            case types.ActionType.StylusDown:
                shapes = this.getShapes(currentAction, currentAction, pen, SegmentCircleInclusive.End);
                break;

            case types.ActionType.StylusMove:
                shapes = this.getShapes(previousAction, currentAction, pen, SegmentCircleInclusive.End);
                break;

            case types.ActionType.StylusUp:
                shapes = this.getShapes(previousAction, currentAction, pen, SegmentCircleInclusive.End);
                break;

            default:
                break;
        }

        if (shapes) {
            this.context.fillStyle = ui.toColorStringNoAlpha(pen.color);
            for (let shape of shapes) {
                this.context.beginPath();
                shape.render(this.context, { x: 0, y: 0 });
                this.context.closePath();
                this.context.fill();
            }
        }
    }

    private addAndDrawStroke(delta: types.IDelta, submit: boolean) {
        if (submit) {
            this.model.submitOp(delta);
        }

        let dirtyLayers: { [key: string]: any } = {};
        for (let operation of delta.operations) {
            let type = types.getActionType(operation);
            if (type === types.ActionType.Clear) {
                this.clearCanvas();
                this.lastLayerRenderOp = {};
                dirtyLayers = {};
            } else {
                // Get the layer the delta applies to
                let stylusId = types.getStylusId(operation);
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
        startPoint: types.IStylusAction,
        endPoint: types.IStylusAction,
        pen: types.IPen,
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
