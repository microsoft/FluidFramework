// The main app code
import * as $ from "jquery";
import * as api from "../api";
import * as ink from "../ink";
import * as ui from "../ui";
import { debug } from "./debug";
import InkCanvas from "./inkCanvas";
import StickyNote from "./stickyNote";

const colors: ink.IColor[] = [
    { r: 253 / 255, g:   0 / 255, b:  12 / 255, a: 1 },
    { r: 134 / 255, g:   0 / 255, b:  56 / 255, a: 1 },
    { r: 253 / 255, g: 187 / 255, b:  48 / 255, a: 1 },
    { r: 255 / 255, g: 255 / 255, b:  81 / 255, a: 1 },
    { r:   0 / 255, g:  45 / 255, b:  98 / 255, a: 1 },
    { r: 255 / 255, g: 255 / 255, b: 255 / 255, a: 1 },
    { r: 246 / 255, g:  83 / 255, b:  20 / 255, a: 1 },
    { r:   0 / 255, g: 161 / 255, b: 241 / 255, a: 1 },
    { r: 124 / 255, g: 187 / 255, b:   0 / 255, a: 1 },
    { r:   8 / 255, g: 170 / 255, b:  51 / 255, a: 1 },
    { r:   0 / 255, g:   0 / 255, b:   0 / 255, a: 1 },
];

// tslint:disable-next-line:no-string-literal
const Microsoft = window["Microsoft"];

/**
 * Canvas app
 */
export class Canvas {
    public ink: InkCanvas;
    public handleKeys: boolean = true;
    public stickyCount: number = 0;

    private chartsHost: any;

    // Map indicating whether or not we have processed a given object
    private canvasObjects: {[key: string]: Promise<void> } = {};

    constructor(model: ink.IInk, private components: api.IMap) {
        this.chartsHost = new Microsoft.Charts.Host({ base: "https://charts.microsoft.com" });

        // register all of the different handlers
        let p = document.getElementById("hitPlane");

        this.refreshComponents();
        this.components.on("op", () => {
            this.refreshComponents();
        });

        this.ink = new InkCanvas(model, p);

        window.addEventListener("keydown", (evt) => this.keyPress(evt), false);
        window.addEventListener("keyup", (evt) => this.keyRelease(evt), false);

        document.querySelector("#replay").addEventListener("click", (e) => { this.ink.replay(); }, false);

        const root = $("#color-picker");
        for (const color of colors) {
            const cssColor = ui.toColorString(color);
            const elem = $(`<li><a class="color-choice" href="#" style="background-color: ${cssColor}" ></a></li>`);
            root.append(elem);
            elem.data("color", color);
            elem.click(() => {
                this.ink.setPenColor(elem.data("color"));
            });
        }
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
        } else if (evt.ctrlKey === true && evt.keyCode !== 17) {  // look for keys while control down
            if (evt.keyCode === 67) {        // Control c
                evt.preventDefault();
            } else if (evt.keyCode === 86) { // Control v
                evt.preventDefault();
            } else if (evt.keyCode === 79) { // Control o
                evt.preventDefault();
            } else if (evt.keyCode === 83) { // Control s
                evt.preventDefault();
            } else if (evt.keyCode === 82) { // Control r
                evt.preventDefault();
            } else if (evt.keyCode === 81) { // Control q
                evt.preventDefault();
            } else if (evt.keyCode === 89) { // Control y
                evt.preventDefault();
            } else if (evt.keyCode === 90) { // Control z
                evt.preventDefault();
            }
        }
    }

    // this method will try up the entire board
    public clear() {
        this.ink.clear();
        let board = ui.id("content");
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
            new StickyNote(ui.id("content"));
        }
        if (e.target.id === "turnOnInk") {
            this.makeInkable();
        }
    }

    private handleChromeEvents(chrome: HTMLElement, object: api.IMapView) {
        let pointerDown = false;
        let lastPoint: { x: number, y: number };

        chrome.addEventListener("pointerdown", (evt) => {
            pointerDown = true;
            lastPoint = { x: evt.clientX, y: evt.clientY };
            evt.returnValue = false;
            chrome.setPointerCapture(evt.pointerId);
        }, false);

        chrome.addEventListener("pointermove", (evt) => {
            if (pointerDown) {
                let deltaX = evt.clientX - lastPoint.x;
                let deltaY = evt.clientY - lastPoint.y;

                const position = object.get("position");
                position.x += deltaX;
                position.y += deltaY;
                object.set("position", position);

                chrome.style.top = `${position.y}px`;
                chrome.style.left = `${position.x}px`;

                lastPoint = { x: evt.clientX, y: evt.clientY };
                evt.returnValue = false;
            }
        }, false);

        chrome.addEventListener("pointerup", (evt) => {
            pointerDown = false;
            chrome.releasePointerCapture(evt.pointerId);
        }, false);
    }

    private updateSizeAndPosition(chrome: HTMLDivElement, content: HTMLDivElement, position, size) {
        chrome.style.top = `${position.y}px`;
        chrome.style.left = `${position.x}px`;
        chrome.style.width = `${size.width + 10}px`;
        chrome.style.height = `${size.height + 10}px`;
        content.style.width = `${size.width}px`;
        content.style.height = `${size.height}px`;
    }

    private updateChart(chart, componentView: api.IMapView) {
        const config = componentView.get("data");
        const size = componentView.get("size");
        if (config) {
            config.size = size;
            chart.setConfiguration(config);
        }
    }

    private loadChart(content: HTMLElement, component: api.IMap, componentView: api.IMapView) {
        const chart = new Microsoft.Charts.Chart(this.chartsHost, content);
        chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);

        this.updateChart(chart, componentView);
        component.on("valueChanged", (event) => {
            if (event.key === "data" || event.key === "size") {
                this.updateChart(chart, componentView);
            }
        });
    }

    private async addDocument(id: string, component: api.IMap): Promise<void> {
        const componentView = await component.getView();

        const type = componentView.get("type");
        debug(`Loading ${id} of type ${type}`);

        // Generate the stub for where to place the document
        let content = document.getElementById("content");
        let chrome = document.createElement("div");
        chrome.classList.add("canvas-chrome");

        let newDocument = document.createElement("div");
        newDocument.classList.add("collab-document");

        chrome.appendChild(newDocument);
        content.appendChild(chrome);

        this.updateSizeAndPosition(chrome, newDocument, componentView.get("position"), componentView.get("size"));
        this.handleChromeEvents(chrome, componentView);

        // Listen for updates to the positio of the element
        component.on("valueChanged", (event) => {
            if (event.key === "position" || event.key === "size") {
                this.updateSizeAndPosition(
                    chrome, newDocument, componentView.get("position"), componentView.get("size"));
            }
        });

        if (type === "chart") {
            this.loadChart(newDocument, component, componentView);
        }

        // Don't let events inside the content bubble up to the chrome
        newDocument.addEventListener("pointerdown", (evt) => {
            evt.stopPropagation();
            return false;
        }, false);
    }

    private async refreshComponents() {
        // TODO need to support deletion of components
        const componentsView = await this.components.getView();

        // Pull in all the objects on the canvas
        // tslint:disable-next-line:forin
        for (let componentName of componentsView.keys()) {
            const component = componentsView.get(componentName) as api.IMap;
            const canvasObject = this.canvasObjects[componentName];

            if (canvasObject === undefined) {
                // Load in the referenced document and render
                this.canvasObjects[componentName] = this.addDocument(componentName, component);
            }
        }
    }
}
