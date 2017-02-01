import * as ink from "ot-ink";
import * as geometry from "./geometry/index";
import { Circle, IShape, Polygon } from "./shapes/index";
import * as utils from "./utils";

// TODO split classes into separate files
// tslint:disable:max-classes-per-file

// TODO remove before commit
// tslint:disable:no-console

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

    constructor(evt: PointerEvent) {
        this.rawPosition = { x: evt.x, y: evt.y };
        this.properties = { isEraser: false };
    }
}

export default class InkCanvas {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public penID: number = -1;
    public gesture: MSGesture;

    private strokes: ink.IMixInkAction[] = [];

    // constructor
    constructor(parent: HTMLElement) {
        // setup canvas
        this.canvas = document.createElement("canvas");
        this.canvas.classList.add("drawSurface");
        parent.appendChild(this.canvas);

        // tslint:disable-next-line:no-string-literal
        window["strokes"] = this.strokes;

        // get context
        this.context = this.canvas.getContext("2d");

        let bb = false;
        this.canvas.addEventListener("pointerdown", (evt) => this.handlePointerDown(evt), bb);
        this.canvas.addEventListener("pointermove", (evt) => this.handlePointerMove(evt), bb);
        this.canvas.addEventListener("pointerup", (evt) => this.handlePointerUp(evt), bb);

        // Set the initial size of hte canvas and then register for resize events to be able to update it
        this.resize(this.canvas.offsetWidth, this.canvas.offsetHeight);
        window.addEventListener("throttled-resize", (event) => {
            this.resize(this.canvas.offsetWidth, this.canvas.offsetHeight);
        });
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

    public selectAll() {
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

    // We will accept pen down or mouse left down as the start of a stroke.
    // We will accept touch down or mouse right down as the start of a touch.
    public handlePointerDown(evt) {
        this.penID = evt.pointerId;

        if (evt.pointerType === "touch") {
            // ic.gesture.addPointer(evt.pointerId);
        }

        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Anchor and clear any current selection.
            this.anchorSelection();
            let pt = new EventPoint(evt);

            if (pt.properties.isEraser) { // The back side of a pen, which we treat as an eraser
                this.tempEraseMode();
            } else {
                this.restoreMode();
            }

            this.addAndDrawStroke(pt.rawPosition, ink.MixInkActionKind.Move, evt.pressure);

            evt.returnValue = false;
        }
    }

    public handlePointerMove(evt) {
        if (evt.pointerId === this.penID) {
            // if (evt.pointerType === "touch") {
            // if (evt.pointerType === "pen") {
            // } else {
            // }

            this.addAndDrawStroke({ x: evt.clientX, y: evt.clientY }, ink.MixInkActionKind.Draw, evt.pressure);

            evt.returnValue = false;
        }

        return false;
    }

    public handlePointerUp(evt) {
        if (evt.pointerId === this.penID) {
            this.penID = -1;
            let pt = new EventPoint(evt);
            evt.returnValue = false;

            this.addAndDrawStroke(pt.rawPosition, ink.MixInkActionKind.Draw, evt.pressure);
        }

        return false;
    }

    // We treat the event of the pen leaving the canvas as the same as the pen lifting;
    // it completes the stroke.
    public handlePointerOut(evt) {
        if (evt.pointerId === this.penID) {
            let pt = new EventPoint(evt);
            this.penID = -1;

            this.addAndDrawStroke(pt.rawPosition, ink.MixInkActionKind.Draw, evt.pressure);
        }

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
            this.selectAll();
            this.inkMode();
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        utils.displayStatus("");
        utils.displayError("");
    }

    public replay() {
        this.clearCanvas();

        if (this.strokes.length > 0) {
            this.animateStroke(0);
        }
    }

    private animateStroke(index: number) {
        // Draw the requested stroke
        let currentStroke = this.strokes[index];
        let previousStroke = index - 1 >= 0 ? this.strokes[index - 1] : null;
        this.drawStroke(currentStroke, previousStroke);

        // And then ask for the next one
        let nextStroke = index + 1 < this.strokes.length ? this.strokes[index + 1] : null;
        if (nextStroke) {
            let time = nextStroke.time - currentStroke.time;
            setTimeout(() => this.animateStroke(index + 1), time);
        }
    }

    /**
     * Clears the canvas
     */
    private clearCanvas() {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private redraw() {
        this.clearCanvas();

        let previousStroke: ink.IMixInkAction = null;
        for (let stroke of this.strokes) {
            this.drawStroke(stroke, previousStroke);
            previousStroke = stroke;
        }
    }

    private drawStroke(stroke: ink.IMixInkAction, previous: ink.IMixInkAction) {
        let shapes: IShape[];

        switch (stroke.kind) {
            case ink.MixInkActionKind.Move:
                shapes = this.getShapes(stroke, stroke, ink.SegmentCircleInclusive.End);
                break;

            case ink.MixInkActionKind.Draw:
                shapes = this.getShapes(previous, stroke, ink.SegmentCircleInclusive.End);
                break;

            case ink.MixInkActionKind.Clear:
                this.clearCanvas();
                break;

            default:
                break;
        }

        if (shapes) {
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

    private addAndDrawStroke(
        pt: IPtrEvtPoint,
        kind: ink.MixInkActionKind,
        pressure: number,
        color: string = "rgba(0, 50, 0, 1)") {

        let thickness = pressure * 15;

        // store the stroke command
        let pen: ink.IPen = {
            brush: ink.MixInkBlush.Pen,
            color,
            thickness,
        };

        let stroke: ink.IMixInkAction = {
            kind,
            pen,
            time: new Date().getTime(),
            x: pt.x,
            y: pt.y,
        };

        this.strokes.push(stroke);
        let lastStroke = this.strokes.length > 1 ? this.strokes[this.strokes.length - 2] : null;

        this.drawStroke(stroke, lastStroke);
    }

    /***
     * given start point and end point, get MixInk shapes to render. The returned MixInk
     * shapes may contain one or two circles whose center is either start point or end point.
     * Enum SegmentCircleInclusive determins whether circle is in the return list.
     * Besides circles, a trapezoid that serves as a bounding box of two stroke point is also returned.
     */
    private getShapes(
        startPoint: ink.IMixInkAction,
        endPoint: ink.IMixInkAction,
        circleInclusive: ink.SegmentCircleInclusive): IShape[] {

        let dirVector = new geometry.Vector(endPoint.x - startPoint.x,
            endPoint.y - startPoint.y);
        let len = dirVector.length();

        let shapes = new Array<IShape>();
        let trapezoidP0: geometry.IPoint;
        let trapezoidP1: geometry.IPoint;
        let trapezoidP2: geometry.IPoint;
        let trapezoidP3: geometry.IPoint;
        let normalizedLateralVector: geometry.IVector;
        let widthAtStart = startPoint.pen.thickness / 2;
        let widthAtEnd = endPoint.pen.thickness / 2;

        // Just draws a circle on small values??
        if (len + Math.min(widthAtStart, widthAtEnd) <= Math.max(widthAtStart, widthAtEnd)) {
            let center = widthAtStart >= widthAtEnd ? startPoint : endPoint;
            shapes.push(new Circle({ x: center.x, y: center.y }, center.pen.thickness / 2));
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
                startPoint.x + widthAtStart * normalizedLateralVector.x,
                startPoint.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP3 = new geometry.Point(
                endPoint.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.y + widthAtEnd * normalizedLateralVector.y);

            normalizedLateralVector = geometry.Vector.normalize(geometry.Vector.rotate(dirVector, angle));
            trapezoidP2 = new geometry.Point(
                endPoint.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.y + widthAtEnd * normalizedLateralVector.y);
            trapezoidP1 = new geometry.Point(
                startPoint.x + widthAtStart * normalizedLateralVector.x,
                startPoint.y + widthAtStart * normalizedLateralVector.y);
        } else {
            normalizedLateralVector = new geometry.Vector(-dirVector.y / len, dirVector.x / len);

            trapezoidP0 = new geometry.Point(
                startPoint.x + widthAtStart * normalizedLateralVector.x,
                startPoint.y + widthAtStart * normalizedLateralVector.y);
            trapezoidP1 = new geometry.Point(
                startPoint.x - widthAtStart * normalizedLateralVector.x,
                startPoint.y - widthAtStart * normalizedLateralVector.y);

            trapezoidP2 = new geometry.Point(
                endPoint.x - widthAtEnd * normalizedLateralVector.x,
                endPoint.y - widthAtEnd * normalizedLateralVector.y);
            trapezoidP3 = new geometry.Point(
                endPoint.x + widthAtEnd * normalizedLateralVector.x,
                endPoint.y + widthAtEnd * normalizedLateralVector.y);
        }

        let polygon = new Polygon([trapezoidP0, trapezoidP3, trapezoidP2, trapezoidP1]);
        shapes.push(polygon);

        switch (circleInclusive) {
            case ink.SegmentCircleInclusive.None:
                break;
            case ink.SegmentCircleInclusive.Both:
                shapes.push(new Circle({ x: startPoint.x, y: startPoint.y }, startPoint.pen.thickness / 2));
                shapes.push(new Circle({ x: endPoint.x, y: endPoint.y }, endPoint.pen.thickness / 2));
                break;
            case ink.SegmentCircleInclusive.Start:
                shapes.push(new Circle({ x: startPoint.x, y: startPoint.y }, startPoint.pen.thickness / 2));
                break;
            case ink.SegmentCircleInclusive.End:
                shapes.push(new Circle({ x: endPoint.x, y: endPoint.y }, endPoint.pen.thickness / 2));
                break;
            default:
                break;
        }

        return shapes;
    }
}
