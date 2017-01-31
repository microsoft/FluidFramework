import * as ink from "ot-ink";
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

            let pressureWidth = evt.pressure * 15;
            evt.returnValue = false;

            this.addAndDrawStroke(pt.rawPosition, ink.MixInkActionKind.Move, pressureWidth);
        }
    }

    public handlePointerMove(evt) {
        if (evt.pointerId === this.penID) {
            let pt = new EventPoint(evt);
            let w = 8;
            let h = 8;

            if (evt.pointerType === "touch") {
                // this.context.strokeStyle = "gray";
                w = evt.width;
                h = evt.height;
                // context.strokeRect(evt.x - w/2 - 1, evt.y - h/2 -1 , w+1, h+1);
                // this.context.clearRect(evt.x - w / 4, evt.y - h / 4, w / 2, h / 2);
                evt.returnValue = false;

                return false; // we"re going to clearRect instead
            }

            if (evt.pointerType === "pen") {
                // this.context.strokeStyle = "rgba(0, 50, 0,    1)";
                w = w * (0.1 + evt.pressure);
                h = h * (0.1 + evt.pressure);
            } else { // just mouse
                // this.context.strokeStyle = "rgba(250, 0, 0, 0.5)";
            }

            evt.returnValue = false;

            // let pts = evt.intermediatePoints;
            // for (let i = pts.length - 1; i >= 0 ; i--) {
            // }

            this.addAndDrawStroke({ x: evt.clientX, y: evt.clientY }, ink.MixInkActionKind.Draw, evt.pressure);
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
        switch (stroke.kind) {
            case ink.MixInkActionKind.Draw:
                // Move?
                this.context.beginPath();
                this.context.moveTo(previous.x, previous.y);

                // Draw
                this.context.lineWidth = 10; // stroke.pen.thickness;
                this.context.strokeStyle = stroke.pen.color;
                this.context.lineTo(stroke.x, stroke.y);
                this.context.stroke();
                break;
            default:
                break;
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

    private addAndDrawStroke(pt: IPtrEvtPoint, kind: ink.MixInkActionKind, pressure: number) {
        // store the stroke command
        let pen: ink.IPen = {
            brush: ink.MixInkBlush.Pen,
            color: "rgba(0, 50, 0,    1)",
            thickness: pressure,
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
}
