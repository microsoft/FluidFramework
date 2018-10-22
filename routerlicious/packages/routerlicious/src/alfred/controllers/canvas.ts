import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import * as resources from "@prague/gitresources";
import * as socketStorage from "@prague/socket-storage";
import { registerDocumentServices } from "./utils";

async function loadDocument(id: string, version: resources.ICommit, token: string, client: any): Promise<api.Document> {
    console.log("Loading in root document...");

    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);
    const document = await api.load(id, claims.tenantId, claims.user, token, { encrypted: false }, version);

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(id: string, version: resources.ICommit, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    registerDocumentServices(config);

    const doc = await loadDocument(id, version, token, config.client);
    const root = await doc.getRoot().getView();

    const canvasDiv = document.createElement("div");
    if (!doc.existing) {
        root.set("ink", doc.createStream());
    } else {
        await root.wait("ink");
    }

    const canvas = new controls.FlexView(canvasDiv, doc, root);
    host.attach(canvas);
}
