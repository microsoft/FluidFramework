import { Block, BoxState } from "@prague/app-ui";
import { getDefaultDocumentService } from "@prague/client-api";
import * as loader from "@prague/loader";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import { TokenService } from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";
import { FlowViewContext } from "./flowViewContext";

const documentSym = Symbol("Document.document");
const platformSym = Symbol("Document.platform");

export class DocumentState extends BoxState {
    public id: string;
    public [documentSym]: loader.Document;
    public [platformSym]: WebPlatform;
}

export class Document extends Block<DocumentState> {
    // TODO taking a dependency on the loader, loader-web, and socket-storage is not something we want to do.
    // This component needs access to the core abstract loader defined in runtime-definitions
    // but we need to update the API to provide it access and include the necessary methods.
    // We cut some corners below to start experimenting with dynamic document loading.
    private webLoader = new WebLoader();
    private tokenService = new TokenService();

    protected mounting(self: DocumentState, context: FlowViewContext): HTMLElement {
        console.log(`Mount value is ${self.id}`);

        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");
        div.style.width = "400px";
        div.style.height = "600px";

        // TODO also something that shouldn't be direclty exposed
        const tenant = "prague";
        const key = "43cfc3fbf04a97c0921fd23ff10f9e4b";
        const token = jwt.sign(
            {
                documentId: self.id,
                permission: "read:write",
                tenantId: tenant,
                user: { id: "loader-client" },
            },
            key);

        const webPlatform = new WebPlatform(div);
        const documentP = loader.load(
            token,
            null,
            webPlatform,
            getDefaultDocumentService(),
            this.webLoader,
            this.tokenService,
            null,
            true);
        documentP.then(
            (document) => {
                self[documentSym] = document;
                self[platformSym] = webPlatform;
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
