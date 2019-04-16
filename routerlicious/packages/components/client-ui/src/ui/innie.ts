import { Block, BoxState } from "@prague/app-ui";
import { Document } from "@prague/client-api";
import { IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";
import { parse } from "url";
import { definitionGuide } from "./definitionGuide";
import { FlowViewContext } from "./flowViewContext";

const platformSym = Symbol("Document.platform");

// TODO (mdaumi): Fix this later.
class InnerPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement, private readonly invalidateLayout: (width, height) => void) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "root":
                return { entry: definitionGuide.getValue(), type: "IComponents" };
            case "div":
                return this.div;
            case "dts":
                return definitionGuide;
            case "invalidateLayout":
                return this.invalidateLayout;
            default:
                return null;
        }
    }

    public update() {
        this.emit("update");
    }

    public detach() {
        return;
    }
}

export class InnerDocumentState extends BoxState {
    public id: string;
}

export class InnerComponent extends Block<InnerDocumentState> {
    // TODO taking a dependency on the loader, loader-web, and socket-storage is not something we want to do.
    // This component needs access to the core abstract loader defined in runtime-definitions
    // but we need to update the API to provide it access and include the necessary methods.
    // We cut some corners below to start experimenting with dynamic document loading.
    protected mounting(self: InnerDocumentState, context: FlowViewContext): HTMLElement {
        console.log(`Mount value is ${self.id}`);

        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");
        div.style.width = "400px";
        div.style.height = "600px";

        const parsedHref = parse(window.location.href);
        const openUrl = `${parsedHref.pathname}/${self.id}`;

        const openDoc = document.createElement("a");
        openDoc.href = openUrl;
        openDoc.target = "_blank";
        openDoc.innerText = openUrl;
        openDoc.style.display = "block";
        openDoc.style.width = "100%";
        openDoc.classList.add("component-link");

        const mountDiv = document.createElement("div");
        mountDiv.classList.add("mount-point");
        mountDiv.style.flexWrap = "wrap";
        mountDiv.appendChild(openDoc);
        mountDiv.appendChild(div);

        // This is my access to the document
        const collabDocument = context.services.get("document") as Document;
        const runtime = collabDocument.runtime;

        const invalidateLayout = (width: number, height: number) => {
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;
            context.services.get("invalidateLayout")();
        };

        (runtime as any).getComponent(self.id, true).then((process) => {
            console.log("Got me a pinpoint!");
            const platform = new InnerPlatform(div, invalidateLayout);
            process.attach(platform).then((innerPlatform) => {
                console.log("Attached and got its inner platform!");
                definitionGuide.addComponent(process.id, innerPlatform);
            });
        });

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, mountDiv);
    }

    protected unmounting(self: BoxState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: InnerDocumentState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        if (self[platformSym]) {
            self[platformSym].update();
        }

        return element;
    }
}
