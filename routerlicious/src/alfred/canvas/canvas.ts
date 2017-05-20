// The main app code
import * as $ from "jquery";
import * as ink from "../../ink";
import InkCanvas from "./inkCanvas";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

const colors: ink.IColor[] = [
    { r: 253 / 255, g:   0 / 255, b:  12 / 255, a: 1 },
    { r: 134 / 255, g:   0 / 255, b:  56 / 255, a: 1 },
    { r: 253 / 255, g: 187 / 255, b:  48 / 255, a: 1 },
    { r:   255 / 255, g:  255 / 255, b:  81 / 255, a: 1 },
    { r:   0 / 255, g:  45 / 255, b:  98 / 255, a: 1 },
    { r: 255 / 255, g: 255 / 255, b: 255 / 255, a: 1 },
    { r: 246 / 255, g:  83 / 255, b:  20 / 255, a: 1 },
    { r:   0 / 255, g: 161 / 255, b: 241 / 255, a: 1 },
    { r: 124 / 255, g: 187 / 255, b:   0 / 255, a: 1 },
    { r:   8 / 255, g: 170 / 255, b:  51 / 255, a: 1 },
    { r:   0 / 255, g:   0 / 255, b:   0 / 255, a: 1 },
];

/**
 * Canvas app
 */
export class Canvas {
    public ink: InkCanvas;
    public handleKeys: boolean = true;
    public stickyCount: number = 0;

    // Map indicating whether or not we have processed a given object
    // private canvasObjects: {[key: string]: any } = {};

    constructor(model: ink.IInk) {
        // register all of the different handlers
        let p = document.getElementById("hitPlane");

        // this.refreshCanvasObjects();
        // model.on("op", (op, source) => {
        //     if (source === this) {
        //         return;
        //     }

        //     // Update the canvas
        //     this.refreshCanvasObjects();
        // });

        this.ink = new InkCanvas(model, p);

        window.addEventListener("keydown", (evt) => this.keyPress(evt), false);
        window.addEventListener("keyup", (evt) => this.keyRelease(evt), false);

        document.querySelector("#replay").addEventListener("click", (e) => { this.ink.replay(); }, false);

        const root = $("#color-picker");
        for (const color of colors) {
            const cssColor = utils.toColorString(color);
            const elem = $(`<li><a class="color-choice" href="#" style="background-color: ${cssColor}" ></a></li>`);
            root.append(elem);
            elem.data("color", color);
            elem.click(() => {
                this.ink.setPenColor(elem.data("color"));
            });
        }

        // toolbar buttons
        // document.querySelector("#strokeColors")
        // .addEventListener("click", (e) => { this.ink.inkColor(); }, false);
        // document.querySelector("#clearButton").addEventListener("click", (e) => { this.clear(); }, false);
        // document.querySelector("#undoButton").addEventListener("click", (e) => { this.ink.undo(); }, false);
        // document.querySelector("#redoButton").addEventListener("click", (e) => { this.ink.redo(); }, false);
        // document.querySelector("#testButton").addEventListener("click", (e) => { this.test(e); }, false);
        // document.querySelector("#turnOnInk").addEventListener("click", (e) => { this.test(e); }, false);
        // document.querySelector("#editor").addEventListener("click", (e) => { this.addDocument(); }, false);
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
            // tslint:disable-next-line:no-unused-new
            new StickyNote(utils.id("content"));
        }
        if (e.target.id === "turnOnInk") {
            this.makeInkable();
        }
    }

    // private handleChromeEvents(chrome: HTMLElement, object: IObject) {
    //     let pointerDown = false;
    //     let lastPoint: { x: number, y: number };

    //     chrome.addEventListener("pointerdown", (evt) => {
    //         pointerDown = true;
    //         lastPoint = { x: evt.clientX, y: evt.clientY };
    //         evt.returnValue = false;
    //         chrome.setPointerCapture(evt.pointerId);
    //     }, false);

    //     chrome.addEventListener("pointermove", (evt) => {
    //         if (pointerDown) {
    //             let deltaX = evt.clientX - lastPoint.x;
    //             let deltaY = evt.clientY - lastPoint.y;

    //             object.location.x += deltaX;
    //             object.location.y += deltaY;

    //             chrome.style.top = `${object.location.y}px`;
    //             chrome.style.left = `${object.location.x}px`;

    //             lastPoint = { x: evt.clientX, y: evt.clientY };
    //             evt.returnValue = false;

    //             // Update the object properties
    //             let location = _.indexOf(this.model.data.objects, object);
    //             this.model.submitOp(
    //                 {p: ["objects", location, "location"], oi: object.location },
    //                 { source: this });
    //         }
    //     }, false);

    //     chrome.addEventListener("pointerup", (evt) => {
    //         pointerDown = false;
    //         chrome.releasePointerCapture(evt.pointerId);
    //     }, false);
    // }

    // private addDocument(object: IObject = null) {
    //     let create = !object;
    //     if (create) {
    //         object = {
    //             id: uuid.v4(),
    //             location: {
    //                 x: 300 + this.model.data.objects.length * 400,
    //                 y: 100,
    //             },
    //             type: "document",
    //             width: 400,
    //         };
    //     }

    //     // Mark that we've processed this object
    //     this.canvasObjects[object.id] = true;

    //     // let inkP = Ink.GetOrCreate(this.connection, )
    //     let documentP = DocumentModel.GetOrCreate(this.connection, object.id);
    //     documentP.then((richText) => {
    //         // TODO/NOTES - We want some kind of loading animation here. But trying to avoid
    //         // a race condition with creating the new document and broadcasting it exists to others.
    //         // There's a chance we could update the JSON OT type Canvas uses before we actually create
    //         // the Rich Text OT type.
    //         // Going conservative for now and waiting for it to be created before updating the canvas.
    //         // Will want to understand what the UX should do as well.

    //         // Generate the stub for where to place the document
    //         let content = document.getElementById("content");
    //         let chrome = document.createElement("div");
    //         chrome.classList.add("canvas-chrome");
    //         chrome.style.top = `${object.location.y}px`;
    //         chrome.style.left = `${object.location.x}px`;
    //         chrome.style.width = `${object.width + 10}px`;
    //         this.handleChromeEvents(chrome, object);

    //         let newDocument = document.createElement("div");
    //         newDocument.classList.add("collab-document");

    //         chrome.appendChild(newDocument);
    //         content.appendChild(chrome);

    //         // TODO need a better way to reference these
    //         this.canvasObjects[object.id] = chrome;

    //         // Don't let events inside the content bubble up to the chrome
    //         newDocument.addEventListener("pointerdown", (evt) => {
    //             evt.stopPropagation();
    //             return false;
    //         }, false);

    //         // TODO create the new remote object
    //         if (create) {
    //             let newObject = object;
    //             this.model.submitOp(
    //                 {p: ["objects", this.model.data.objects.length + 1], li: newObject },
    //                 { source: this });
    //         }

    //         // tslint:disable-next-line:no-unused-new
    //         new Document(newDocument, richText);
    //     });
    // }

    // private refreshCanvasObjects() {
    //     // Pull in all the objects on the canvas
    //     for (let object of this.model.data.objects) {
    //         let canvasObject = this.canvasObjects[object.id];
    //         if (canvasObject === undefined) {
    //             // Load in the referenced document and render
    //             this.addDocument(object);
    //         } else if (canvasObject !== true) {
    //             canvasObject.style.top = `${object.location.y}px`;
    //             canvasObject.style.left = `${object.location.x}px`;
    //         }
    //     }
    // }
}
