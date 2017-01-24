// The main app code
import * as $ from "jquery";
import * as otInk from "ot-ink";
import * as sharedb from "sharedb/lib/client";
import BackBoard from "./backBoard";
import InkCanvas from "./inkCanvas";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

// Register the use of the rich text OT format
sharedb.types.register(otInk.type);

// tslint:disable:no-console

// App Class 
export class App {
    public ink: InkCanvas;

    public handleKeys: boolean = true;
    public stickyCount: number = 0;

    constructor() {

        // register all of the different handlers
        let p: HTMLElement = utils.id("hitPlane");
        this.ink = new InkCanvas(p);

        window.addEventListener("keydown", (evt) => this.keyPress(evt), false);
        window.addEventListener("keyup", (evt) => this.keyRelease(evt), false);

        // toolbar buttons
        document.querySelector("#strokeColors").addEventListener("click", (e) => { this.ink.inkColor(); }, false);
        document.querySelector("#clearButton").addEventListener("click", (e) => { this.clear(); }, false);
        document.querySelector("#undoButton").addEventListener("click", (e) => { this.ink.undo(); }, false);
        document.querySelector("#redoButton").addEventListener("click", (e) => { this.ink.redo(); }, false);
        document.querySelector("#testButton").addEventListener("click", (e) => { this.test(e); }, false);
        document.querySelector("#turnOnInk").addEventListener("click", (e) => { this.test(e); }, false);
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
        // tslint:disable-next-line:prefer-for-of:stickies is NodeListOf not an array
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
                let ic = new InkCanvas(elem);
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
}

export function initialize(id: string) {
    // Open WebSocket connection to ShareDB server
    let protocol = window.location.protocol.indexOf("https") !== -1 ? "wss" : "ws";
    let socket = new WebSocket(`${protocol}://${window.location.host}`);
    let connection = new sharedb.Connection(socket);

    // create the new app
    $("document").ready(() => {
        let appObject = new App();
        let sticky = new StickyNote(utils.id("content"));
        let mainBoard = new BackBoard(appObject, "hitPlane");
        // id("ToolBar").appendChild(new ToolBarButton("images/icons/pencil.svg").click(appObject.clear).elem());

        let doc = connection.get("canvas", id);
        doc.subscribe((err) => {
            if (err) {
                throw err;
            }

            // If there is no type we need to create the document
            if (!doc.type) {
                console.log("Creating new document");
                doc.create("Hello", otInk.type.name);
            }

            console.log(doc.data);

            // To write more data
            doc.submitOp(
                { position: 3, text: "World, " },
                { source: appObject });

            doc.on("op", (op, source) => {
                if (source === appObject) {
                    return;
                }

                // Update the canvas
            });
        });
    });
}
