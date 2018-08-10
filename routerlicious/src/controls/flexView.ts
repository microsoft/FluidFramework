// The main app code
import { IGenericBlob } from "../api-core";
import { blobUploadHandler } from "../blob";
import { api, core, types} from "../client-api";
import * as ui from "../ui";
import { Button } from "./button";
import { Chart } from "./chart";
import { debug } from "./debug";
import { DockPanel } from "./dockPanel";
import { Image } from "./image";
import { InkCanvas } from "./inkCanvas";
import { Popup } from "./popup";
import { Orientation, StackPanel } from "./stackPanel";
import { Video } from "./video";

const colors: types.IColor[] = [
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

interface IFlexViewComponent {
    component: ui.Component;
    position: ui.IPoint;
    size: ui.ISize;
}

/**
 * Canvas app
 */
export class FlexView extends ui.Component {
    private colorButton: Button;
    private dock: DockPanel;
    private ink: InkCanvas;
    private popup: Popup;
    private colorStack: StackPanel;
    private components: IFlexViewComponent[] = [];

    constructor(element: HTMLDivElement, doc: api.Document, root: types.IMapView) {
        super(element);

        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new DockPanel(dockElement);
        this.addChild(this.dock);

        this.addBlobListeners(doc);

        // Add the ink canvas to the dock
        // Add blob Upload Handler
        const inkCanvasElement = document.createElement("div");
        this.ink = new InkCanvas(inkCanvasElement, root.get("ink"));
        this.dock.addContent(this.ink);
        blobUploadHandler(inkCanvasElement, doc, (incl) => this.renderFunc(incl, this.ink));

        this.addButtons();

        // UI components on the flex view
        if (!root.has("components")) {
            root.set("components", doc.createMap());
        }
        this.processComponents(root.get("components"));
    }

    protected resizeCore(bounds: ui.Rectangle) {
        // Update the base ink dock
        bounds.conformElement(this.dock.element);
        this.dock.resize(bounds);

        // Layout component windows
        for (const component of this.components) {
            const componentRect = new ui.Rectangle(
                component.position.x,
                component.position.y,
                component.size.width,
                component.size.height);
            componentRect.conformElement(component.component.element);
            component.component.resize(componentRect);
        }

        // Size the color swatch popup
        const colorButtonRect = ui.Rectangle.fromClientRect(this.colorButton.element.getBoundingClientRect());
        const popupSize = this.popup.measure(bounds);
        const rect = new ui.Rectangle(
            colorButtonRect.x,
            colorButtonRect.y - popupSize.height,
            popupSize.width,
            popupSize.height);
        rect.conformElement(this.popup.element);
        this.popup.resize(rect);
    }

    private addBlobListeners(doc: api.Document) {

        doc.on(core.BlobPrepared, (message) => {
            this.render(message);
        });

        doc.on(core.BlobUploaded, async (message) => {
            const blob = await doc.getBlob(message);
            this.render(blob);
        });

        // Load blobs on start
        doc.getBlobMetadata()
            .then((blobs) => {
                for (const blob of blobs) {
                    this.render(blob);
                }
                return blobs;
            });
    }

    private addButtons() {
        const stackPanelElement = document.createElement("div");
        const buttonSize = { width: 50, height: 50 };
        const stackPanel = new StackPanel(stackPanelElement, Orientation.Horizontal, ["navbar-prague"]);
        this.colorButton = new Button(
            document.createElement("div"),
            buttonSize,
            ["btn", "btn-palette", "prague-icon-pencil"]);
        const replayButton = new Button(
            document.createElement("div"),
            buttonSize,
            ["btn", "btn-palette", "prague-icon-replay"]);

        const videoPlay = new Button(
            document.createElement("div"),
            buttonSize,
            ["btn", "btn-palette", "prague-icon-tube"]);

        stackPanel.addChild(this.colorButton);
        stackPanel.addChild(replayButton);
        stackPanel.addChild(videoPlay);
        this.dock.addBottom(stackPanel);

        replayButton.on("click", (event) => {
            debug("Replay button click");
            this.ink.replay();
        });

        this.colorButton.on("click", (event) => {
            debug("Color button click");
            this.popup.toggle();
        });

        videoPlay.on("click", () => {
            const videos = document.getElementsByTagName("video");
            if (videos.length === 1) {
                const video = videos.item(0);
                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
            }
        });

       // These should turn into components
        this.colorStack = new StackPanel(document.createElement("div"), Orientation.Vertical, []);
        for (const color of colors) {
            const buttonElement = document.createElement("div");
            buttonElement.style.backgroundColor = ui.toColorString(color);
            const button = new Button(buttonElement, { width: 200, height: 50 }, ["btn-flat"]);
            this.colorStack.addChild(button);

            button.on("click", (event) => {
                this.ink.setPenColor(color);
                this.popup.toggle();
            });
        }

        // Popup to display the colors
        this.popup = new Popup(document.createElement("div"));
        this.popup.addContent(this.colorStack);
        this.addChild(this.popup);
        this.element.appendChild(this.popup.element);
    }

    private async processComponents(components: types.IMap) {
        const view = await components.getView();

        // Pull in all the objects on the canvas
        // tslint:disable-next-line:forin
        for (const componentName of view.keys()) {
            const component = view.get(componentName) as types.IMap;
            this.addComponent(component);
        }

        components.on("valueChanged", (event) => {
            if (view.has(event.key)) {
                this.addComponent(view.get(event.key));
            }
        });
    }

    private async addComponent(component: types.IMap) {
        const details = await component.getView();
        if (details.get("type") !== "chart") {
            return;
        }

        const size = details.get("size");
        const position = details.get("position");
        const chart = new Chart(document.createElement("div"), details.get("data"));
        this.components.push({ size, position, component: chart });

        this.element.insertBefore(chart.element, this.element.lastChild);
        this.addChild(chart);
        this.resizeCore(this.size);
    }

    private async render(incl: IGenericBlob) {
        this.renderFunc(incl, this.ink);
    }

    private renderFunc = async (incl: IGenericBlob, ink: InkCanvas) => {

        if (incl.type === "image") {
            if (document.getElementById(incl.sha) === null) { // Handle blob Processed
                const imageDiv = document.createElement("div");
                imageDiv.id = incl.sha;
                imageDiv.style.height = incl.height + 40 + "px";
                imageDiv.style.width = incl.width + 15 + "px";
                imageDiv.style.border = "3px solid black";

                const image = new Image(imageDiv, incl.url);
                ink.addPhoto(image);
            } else { // handle blob uploaded
                const imageDiv = document.getElementById(incl.sha);
                const image = imageDiv.getElementsByTagName("img").item(0);
                if (image.naturalWidth === 0) {
                    image.src = image.src;
                }
            }

        } else if (incl.type === "video") {
            if (document.getElementById(incl.sha) === null) {
                const videoDiv = document.createElement("div");
                videoDiv.id = incl.sha;
                videoDiv.style.height = incl.height + 40 + "px";
                videoDiv.style.width = incl.width + 15 + "px";
                videoDiv.style.border = "3px solid black";
                ink.addVideo(new Video(videoDiv, incl.url));
            } else {
                const videoDiv = document.getElementById(incl.sha);
                const video = videoDiv.getElementsByTagName("video").item(0);
                if (video.height === 0) {
                    video.src = video.src;
                    video.load();
                }
            }
        }
    }
}
