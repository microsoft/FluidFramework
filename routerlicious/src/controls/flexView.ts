// The main app code
import { api, core, types} from "../client-api";
import { ImageAnalytics } from "../intelligence";
import * as ui from "../ui";
import { Button } from "./button";
import { Chart } from "./chart";
import { debug } from "./debug";
import { DockPanel } from "./dockPanel";
import { Image } from "./image";
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

    constructor(element: HTMLDivElement, private doc: api.Document, root: types.IMapView) {
        super(element);

        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new DockPanel(dockElement);
        this.addChild(this.dock);

        doc.on(core.BlobPrepared, (message) => {
            this.renderImage(message);
        });

        doc.on(core.BlobUploaded, async (message) => {
            this.renderImage(await doc.getBlob(message));
        });

        // Load blobs on start
        doc.getBlobMetadata()
            // Render metadata
            .then((blobs) => {
                for (const blob of blobs) {
                    if (blob.type.includes("image")) {
                        this.renderImage(blob);
                    }
                }
                return blobs;
            })
            // fetch and render content
            .then(async (blobs) => {
                for (const blob of blobs) {
                    doc.getBlob(blob.sha)
                        .then((blobWithContent) => {
                            this.renderImage(blobWithContent);
                        });
                }
            });

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

        const uploadBlobButton = new Button(
            buttonDiv,
            buttonSize,
            ["btn", "btn-palette", "prague-icon-tube"]);

        stackPanel.addChild(this.colorButton);
        stackPanel.addChild(replayButton);
        stackPanel.addChild(uploadBlobButton);
        this.dock.addBottom(stackPanel);

        replayButton.on("click", (event) => {
            debug("Replay button click");
            this.ink.replay();
        });

        this.colorButton.on("click", (event) => {
            debug("Color button click");
            this.popup.toggle();
        });

        // Upload Blob
        uploadBlobButton.on("click", (event) => {
            input.click();
            input.onchange = async () => {
                const incl = await this.fileToInclusion(input.files.item(0));
                // tslint:disable-next-line:max-line-length
                const analytics = new ImageAnalytics.ImageAnalyticsIntelligentService("3554516ca53c4fffb4bf619cf5d8b043");
                const analysis = JSON.parse(await analytics.run(incl)) as any;
                const caption = analysis.description.captions[0].text;

                incl.caption = caption;

                // Because the blob going in has the content, the blob coming out should as well
                // Other users will have a placeholder render followed by the full thing.
                this.doc.uploadBlob(incl);
            };
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

    private async renderImage(incl: core.IImageBlob) {

        // We have an image, and it isn't in the DOM
        if (incl.type.includes("image")) {

            // Style the metadata of the image
            if (document.getElementById(incl.sha) === null) {
                const newImageDiv = document.createElement("div");
                newImageDiv.id = incl.sha;
                newImageDiv.style.height = incl.height + 40 + "px";
                newImageDiv.style.width = incl.width + 15 + "px";
                newImageDiv.style.border = "3px solid black";
                newImageDiv.classList.add("no-image");

                const image = new Image(newImageDiv, null );
                image.setMessage(incl.caption);
                this.ink.addPhoto(image);
            }

            // Render the Image itself
            const imgDiv = document.getElementById(incl.sha);
            const img = imgDiv.getElementsByTagName("img")[0];

            if (imgDiv.classList.contains("no-image") && incl.content !== null) {
                // TODO (sabroner): use FileReader.readAsDataURL(blob)
                const urlObj = window.URL;
                const url = urlObj.createObjectURL(new Blob([incl.content], {
                    type: incl.type,
                }));
                img.src = url;

                imgDiv.classList.replace("no-image", "image");
            }
        }
    }

    private async fileToInclusion(file: File): Promise<core.IImageBlob> {
        const arrayBufferReader = new FileReader();
        const urlObjReader = new FileReader();

        const incl = {
            fileName: file.name,
            type: file.type,
        } as core.IImageBlob;

        const arrayBufferP = new Promise<void>((resolve, reject) => {
            arrayBufferReader.onerror = (error) => {
                arrayBufferReader.abort();
                reject("error: " + JSON.stringify(error));
            };

            arrayBufferReader.onloadend = () => {
                const imageData = Buffer.from(arrayBufferReader.result);
                incl.size = imageData.byteLength;
                incl.content = imageData;

                resolve();
            };
            arrayBufferReader.readAsArrayBuffer(file);
        });

        const urlObjP = new Promise<void>((resolve, reject) => {
            urlObjReader.onerror = (error) => {
                urlObjReader.abort();
                reject("error: " + JSON.stringify(error));
            };

            urlObjReader.onloadend = () => {
                const imageUrl = urlObjReader.result;
                const img = document.createElement("img");
                img.src = imageUrl;
                img.onload = () => {
                    incl.height = img.height;
                    incl.width = img.width;
                    resolve();
                };
            };

            urlObjReader.readAsDataURL(file);
        });

        return Promise.all([arrayBufferP, urlObjP])
            .then(() => {
                return incl;
        });
    }
}
