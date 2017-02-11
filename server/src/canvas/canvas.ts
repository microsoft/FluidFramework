// The main app code
import { Promise } from "es6-promise";
import * as $ from "jquery";
import * as uuid from "node-uuid";
import * as otInk from "ot-ink";
import * as sharedb from "sharedb/lib/client";
import { Document } from "../editor/document";
import BackBoard from "./backBoard";
import InkCanvas from "./inkCanvas";
import { Canvas as CanvasModel, IObject } from "./models/canvas";
import { RichText } from "./models/richText";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

// Register the use of the rich text OT format
sharedb.types.register(otInk.type);

// tslint:disable:no-console

/**
 * Canvas app
 */
export default class Canvas {
    public static Create(connection: any, modelP: Promise<CanvasModel>): Promise<Canvas> {
        return modelP.then((model) => {
            return new Canvas(connection, model);
        });
    }

    public ink: InkCanvas;
    public handleKeys: boolean = true;
    public stickyCount: number = 0;

    // Map indicating whether or not we have processed a given object
    private canvasObjects: {[key: string]: any } = {};

    constructor(private connection, private model: CanvasModel) {
        // register all of the different handlers
        let p = document.getElementById("hitPlane");

        this.refreshCanvasObjects();

        model.on("op", (op, source) => {
            if (source === this) {
                return;
            }

            // Update the canvas
            this.refreshCanvasObjects();
        });

        let inkP = model.getInkLayer();
        inkP.then((ink) => {
            this.ink = new InkCanvas(p, ink);

            window.addEventListener("keydown", (evt) => this.keyPress(evt), false);
            window.addEventListener("keyup", (evt) => this.keyRelease(evt), false);

            // toolbar buttons
            document.querySelector("#strokeColors").addEventListener("click", (e) => { this.ink.inkColor(); }, false);
            document.querySelector("#clearButton").addEventListener("click", (e) => { this.clear(); }, false);
            document.querySelector("#undoButton").addEventListener("click", (e) => { this.ink.undo(); }, false);
            document.querySelector("#redoButton").addEventListener("click", (e) => { this.ink.redo(); }, false);
            document.querySelector("#testButton").addEventListener("click", (e) => { this.test(e); }, false);
            document.querySelector("#turnOnInk").addEventListener("click", (e) => { this.test(e); }, false);
            document.querySelector("#replay").addEventListener("click", (e) => { this.ink.replay(); }, false);
            document.querySelector("#editor").addEventListener("click", (e) => { this.addDocument(); }, false);
        });
    }

    //  Key Handlers:
    //   Escape
    //   ^C  Copy
    //   ^V  Paste
    //   ^F  Find
    //   ^O  Load
    //   ^S  Save
    //   ^R  Recognize
    //   ^Q  Quit (shuts down the sample app)
    // tslint:disable-next-line:no-empty
    public keyRelease(evt) {
    }

    public keyPress(evt) {
        if (this.handleKeys === false) {
            return false;
        }

        if (evt.keyCode === 27) { // Escape
            evt.preventDefault();
            utils.displayStatus("Escape");
        } else if (evt.ctrlKey === true && evt.keyCode !== 17) {  // look for keys while control down
            utils.displayStatus("KeyCode: " + evt.keyCode);
            if (evt.keyCode === 67) {        // Control c
                evt.preventDefault();
                utils.displayStatus("CTRL-C");
            } else if (evt.keyCode === 86) { // Control v
                evt.preventDefault();
                utils.displayStatus("CTRL-V");
            } else if (evt.keyCode === 79) { // Control o
                evt.preventDefault();
                utils.displayStatus("CTRL-O");
            } else if (evt.keyCode === 83) { // Control s
                evt.preventDefault();
                utils.displayStatus("CTRL-S");
            } else if (evt.keyCode === 82) { // Control r
                evt.preventDefault();
                utils.displayStatus("CTRL-R");
            } else if (evt.keyCode === 81) { // Control q
                evt.preventDefault();
                utils.displayStatus("CTRL-Q");
            } else if (evt.keyCode === 89) { // Control y
                evt.preventDefault();
                utils.displayStatus("CTRL-Y");
            } else if (evt.keyCode === 90) { // Control z
                evt.preventDefault();
                utils.displayStatus("CTRL-Z");
            }
        }
    }

    // this method will try up the entire board
    public clear() {
        this.ink.clear();
        let board = utils.id("content");
        let stickies = document.querySelectorAll(".stickyNote");
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < stickies.length; i++) {
            board.removeChild(stickies[i]);
        }
    }

    // find all of the things that are selected and unselect them
    public unselectAll() {
        let sel = document.querySelectorAll(".stickySelected");
        let elem;
        if (sel.length > 0) {
            for (let i = 0; i < sel.length; i++) {
                elem = sel.item(i);
                if (elem.classList.contains("stickySelected")) {
                    elem.classList.remove("stickySelected");
                    elem.style.zIndex = "1";
                }
            }
        }
    }

    public makeInkable() {
        let sel = document.querySelectorAll(".stickySelected");
        let elem;
        if (sel.length > 0) {
            for (let i = 0; i < sel.length; i++) {
                elem = sel.item(i);
                elem.classList.add("stickyInkable");

                // TODO enable inking for everything later
                // let ic = new InkCanvas(elem);
            }
        }
    }

    // this is the handler for the test tube
    public test(e) {
        if (e.target.id === "testButton") {
            this.unselectAll();
            let x = new StickyNote(utils.id("content"));
        }
        if (e.target.id === "turnOnInk") {
            this.makeInkable();
        }
    }

    private addDocument(object: IObject = null) {
        let create = !object;
        if (create) {
            object = {
                id: uuid.v4(),
                location: {
                    x: 300 + this.model.data.objects.length * 400,
                    y: 100,
                },
                type: "document",
                width: 400,
            };
        }

        // Mark that we've processed this object
        this.canvasObjects[object.id] = true;

        let richTextP = RichText.GetOrCreate(this.connection, object.id);
        richTextP.then((richText) => {
            // TODO/NOTES - We want some kind of loading animation here. But trying to avoid
            // a race condition with creating the new document and broadcasting it exists to others.
            // There's a chance we could update the JSON OT type Canvas uses before we actually create
            // the Rich Text OT type.
            // Going conservative for now and waiting for it to be created before updating the canvas.
            // Will want to understand what the UX should do as well.

            // Generate the stub for where to place the document
            let content = document.getElementById("content");
            let newDocument = document.createElement("div");
            newDocument.classList.add("collab-document");
            newDocument.style.top = `${object.location.y}px`;
            newDocument.style.left = `${object.location.x}px`;
            newDocument.style.width = `${object.width}px`;
            content.appendChild(newDocument);

            // TODO create the new remote object
            if (create) {
                let newObject = object;
                this.model.submitOp(
                    {p: ["objects", this.model.data.objects.length + 1], li: newObject },
                    { source: this });
            }

            let collabDocument = new Document(newDocument, richText);
        });
    }

    private refreshCanvasObjects() {
        // Pull in all the objects on the canvas
        for (let object of this.model.data.objects) {
            if (!this.canvasObjects[object.id]) {
                // Load in the referenced document and render
                this.addDocument(object);
            }
        }
    }
}
