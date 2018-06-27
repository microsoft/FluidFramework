// The main app code
import * as resources from "gitresources";
import { api, types } from "../client-api";
import { gitHashFile } from "../core-utils";
import * as gitStorage from "../git-storage";
import * as ui from "../ui";
import { Button } from "./button";
import { Chart } from "./chart";
import { debug } from "./debug";
import { DockPanel } from "./dockPanel";
import { InkCanvas } from "./inkCanvas";
import { Popup } from "./popup";
import { Orientation, StackPanel } from "./stackPanel";

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

interface IInclusion {
    content: Buffer;
    size: number;
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
    private blobMap: types.IMap; // TODO: make blobMap a sibling of root?

    constructor(element: HTMLDivElement, doc: api.Document, root: types.IMapView) {
        super(element);

        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new DockPanel(dockElement);
        this.addChild(this.dock);

        if (!doc.existing) {
            this.blobMap = root.set<types.IMap>("blobs", doc.createMap());
        } else {
            root.wait<types.IMap>("blobs")
                .then((blobMap) => {
                    this.blobMap = blobMap;
                })
                .catch((error) => {
                    console.log("Blob map failed to load");
                });
        }

        // Add the ink canvas to the dock
        const inkCanvasElement = document.createElement("div");
        this.ink = new InkCanvas(inkCanvasElement, root.get("ink"));
        this.dock.addContent(this.ink);

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

        const buttonDiv = document.createElement("div");
        const input = document.createElement("input");
        input.setAttribute("type", "file");
        input.style.visibility = "hidden";

        const inclusionButton = new Button(
            buttonDiv,
            buttonSize,
            ["btn", "btn-palette", "prague-icon-tube"]);

        const downloadButton = new Button(
            document.createElement("div"),
            buttonSize,
            ["btn", "btn-palette", "prague-icon-pyramid"]);

        stackPanel.addChild(this.colorButton);
        stackPanel.addChild(replayButton);
        stackPanel.addChild(inclusionButton);
        stackPanel.addChild(downloadButton);
        this.dock.addBottom(stackPanel);

        replayButton.on("click", (event) => {
            debug("Replay button click");
            this.ink.replay();
        });

        this.colorButton.on("click", (event) => {
            debug("Color button click");
            this.popup.toggle();
        });

        inclusionButton.on("click", (event) => {
            input.click();
            input.onchange = async () => {
                this.uploadInclusion(await this.fileToInclusion(input.files.item(0)));
            };
        });

        downloadButton.on("click", (event) => {
            this.downloadInclusions();
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

    private async uploadInclusion(file: IInclusion) {
        const docService = api.getDefaultBlobStorage();
        const gitManager: gitStorage.GitManager = docService.manager;

        const hash = gitHashFile(file.content);

        // Set the hash in blob storage
        // TODO: Empty should be the inclusion's information
        await this.blobMap.set<string>(hash, "empty");

        const encodedBuffer = file.content.toString("base64");
        const blobResponseP = gitManager.createBlob(encodedBuffer, "base64") as Promise<resources.ICreateBlobResponse>;
        blobResponseP.then(async (blobResponse) => {
            // TODO: Indicate the inclusion is done uploading
            console.log("Completed uploading blob");
        });
    }

    private async downloadInclusions() {
        const docService = api.getDefaultBlobStorage();
        const gitManager: gitStorage.GitManager = docService.manager;

        const shas: string[] = [];

        const blobView = await this.blobMap.getView();

        for (const key of blobView.keys()) {
            shas.push(key);
        }

        const filesP: Array<Promise<resources.IBlob>> = [];

        for (const sha of shas) {
            console.log("Download Sha: " + sha);
            filesP.push(gitManager.getBlob(sha));
        }
        Promise.all(filesP)
            .then((files) => {
                files.map((blob) => {
                    // Blob returns in base64 based on https://github.com/Microsoft/Prague/issues/732
                    const str = new Buffer(blob.content, "base64").toString("utf-8");
                    this.renderInclusions(str);
                    return str;
                });
            })
            .catch((error) => {
                console.log("Error: " + JSON.stringify(error));
            });
    }

    private renderInclusions(incl: string): void {
        console.log(incl.slice(0, 100));

        // TODO: sabroner finish rendering
    }

    private async fileToInclusion(file: File): Promise<IInclusion> {
        const fr = new FileReader();

        return new Promise<IInclusion>((resolve, reject) => {
            fr.onerror = (error) => {
                fr.abort();
                reject("error: " + JSON.stringify(error));
            };

            fr.onloadend = () => {
                const t = Buffer.from(fr.result);
                const incl = {
                    content: t,
                    size: t.length,
                };
                resolve(incl);
            };
            fr.readAsArrayBuffer(file);
        });
    }
}
