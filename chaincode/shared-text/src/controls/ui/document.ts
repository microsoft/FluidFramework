import { Block, BoxState } from "@prague/app-ui";
import * as api from "@prague/client-api";
import { IPlatform, IPlatformFactory } from "@prague/container-definitions";
import { WebPlatform } from "@prague/loader-web";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { definitionGuide } from "./definitionGuide";
import { FlowViewContext } from "./flowViewContext";

const platformSym = Symbol("Document.platform");

export class DocumentState extends BoxState {
    public url: string;
    public [platformSym]: PlatformFactory;
}

export class Platform extends WebPlatform implements IPlatform {
    constructor(div: HTMLElement, private readonly invalidateLayout: (width, height) => void) {
        super(div);
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "root":
                return { entry: definitionGuide.getValue(), type: "IComponents" };
            case "dts":
                return definitionGuide;
            case "invalidateLayout":
                return this.invalidateLayout;
            default:
                return super.queryInterface(id);
        }
    }

    public detach() {
        return;
    }
}

export class PlatformFactory implements IPlatformFactory {
    // Very much a temporary thing as we flesh out the platform interfaces
    private lastPlatform: Platform;

    constructor(
        private readonly div: HTMLElement,
        private readonly invalidateLayout: (width: number, height: number) => void,
    ) {
    }

    public async create(): Promise<IPlatform> {
        if (this.div) {
            // tslint:disable-next-line:no-inner-html using to clear the list of children
            this.div.innerHTML = "";
        }
        this.lastPlatform = new Platform(this.div, this.invalidateLayout);
        return this.lastPlatform;
    }

    // Temporary measure to indicate the UI changed
    public update() {
        if (!this.lastPlatform) {
            return;
        }

        this.lastPlatform.emit("update");
    }
}

export class Document extends Block<DocumentState> {
    protected mounting(self: DocumentState, context: FlowViewContext): HTMLElement {
        console.log(`Mount value is ${self.url}`);

        const collabDocument = context.services.get("document") as api.Document;

        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");
        div.style.width = "400px";
        div.style.height = "600px";

        const openDoc = document.createElement("a");
        openDoc.href = self.url;
        openDoc.target = "_blank";
        openDoc.innerText = self.url;
        openDoc.style.display = "block";
        openDoc.style.width = "100%";
        openDoc.classList.add("component-link");

        const mountDiv = document.createElement("div");
        mountDiv.classList.add("mount-point");
        mountDiv.style.flexWrap = "wrap";
        mountDiv.appendChild(openDoc);
        mountDiv.appendChild(div);

        const invalidateLayout = (width: number, height: number) => {
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;
            context.services.get("invalidateLayout")();
        };

        const platformFactory = new PlatformFactory(div, invalidateLayout);
        const responseP = collabDocument.runtime.loader.request({ url: self.url });
        const mountedP = responseP.then(async (response) => {
            self[platformSym] = platformFactory;
            console.log("Document loaded");

            if (response.status !== 200) {
                return;
            }

            switch (response.mimeType) {
                case "prague/component":
                    const component = response.value as IComponentRuntime;
                    const platform = await platformFactory.create();
                    const componentPlatform = await component.attach(platform);
                    // query the runtime for its definition - if it exists
                    definitionGuide.addComponent(component.documentId, componentPlatform);
                    break;
            }
        });

        mountedP.catch((error) => console.error("Failed to load document"));

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, mountDiv);
    }

    protected unmounting(self: BoxState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: DocumentState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        if (self[platformSym]) {
            self[platformSym].update();
        }

        return element;
    }
}
