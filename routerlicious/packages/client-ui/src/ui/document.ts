import { Block, BoxState } from "@prague/app-ui";
import { getChaincodeRepo, getDefaultCredentials, getDefaultDocumentService } from "@prague/client-api";
import * as loader from "@prague/loader";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import { IPlatform, IPlatformFactory } from "@prague/runtime-definitions";
import { TokenService } from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";
import { FlowViewContext } from "./flowViewContext";

const documentSym = Symbol("Document.document");
const platformSym = Symbol("Document.platform");

export class DocumentState extends BoxState {
    public id: string;
    public [documentSym]: loader.Document;
    public [platformSym]: PlatformFactory;
}

export class Platform extends WebPlatform {
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
    // TODO taking a dependency on the loader, loader-web, and socket-storage is not something we want to do.
    // This component needs access to the core abstract loader defined in runtime-definitions
    // but we need to update the API to provide it access and include the necessary methods.
    // We cut some corners below to start experimenting with dynamic document loading.
    private tokenService = new TokenService();

    protected mounting(self: DocumentState, context: FlowViewContext): HTMLElement {
        console.log(`Mount value is ${self.id}`);

        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");
        div.style.width = "400px";
        div.style.height = "600px";

        // TODO also something that shouldn't be direclty exposed
        const credentials = getDefaultCredentials();
        const token = jwt.sign(
            {
                documentId: self.id,
                permission: "read:write",
                tenantId: credentials.tenant,
                user: { id: "loader-client" },
            },
            credentials.key);

        const webLoader = new WebLoader(getChaincodeRepo());

        const invalidateLayout = (width: number, height: number) => {
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;
            context.services.get("invalidateLayout")();
        };

        const platformFactory = new PlatformFactory(div, invalidateLayout);

        const documentP = loader.load(
            token,
            { blockUpdateMarkers: true },
            platformFactory,
            getDefaultDocumentService(),
            webLoader,
            this.tokenService,
            null,
            true);
        documentP.then(
            (document) => {
                self[documentSym] = document;
                self[platformSym] = platformFactory;
                console.log("Document loaded");
            },
            (error) => console.error("Failed to load document"));

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, div);
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
