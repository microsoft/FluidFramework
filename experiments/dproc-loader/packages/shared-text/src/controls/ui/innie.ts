import { Block, BoxState } from "@prague/app-ui";
import { Document } from "@prague/client-api";
import { IComponentPlatform, ILegacyRuntime, WebPlatform } from "@prague/runtime";
import { FlowViewContext } from "./flowViewContext";

const platformSym = Symbol("Document.platform");

class InnerPlatform extends WebPlatform implements IComponentPlatform {
    constructor(div: HTMLElement, private readonly invalidateLayout: (width, height) => void) {
        super(div);
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "invalidateLayout":
                return this.invalidateLayout;
            default:
                return super.queryInterface(id);
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

        const mountDiv = document.createElement("div");
        mountDiv.classList.add("mount-point");
        mountDiv.style.flexWrap = "wrap";
        mountDiv.appendChild(div);

        // This is my access to the document
        const collabDocument = context.services.get("document") as Document;
        const runtime = collabDocument.runtime as ILegacyRuntime;

        const invalidateLayout = (width: number, height: number) => {
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;
            context.services.get("invalidateLayout")();
        };

        runtime.getProcess(self.id, true).then((process) => {
            console.log("Got me a pinpoint!");
            const platform = new InnerPlatform(div, invalidateLayout);
            process.attach(platform).then((innerPlatform) => {
                console.log("Attached and got its inner platform!");
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
