import * as resources from "gitresources";
import * as agent from "../../agent";
import { api, socketStorage } from "../../client-api";
import { controls, ui } from "../../client-ui";

async function loadDocument(id: string, version: resources.ICommit, token: string): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: false /* api.isUserLoggedIn() */, token }, version);

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(id: string, version: resources.ICommit, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.tenantId,
        config.trackError);

    // Bootstrap worker service.
    agent.registerWorker(config, "canvas");

    const doc = await loadDocument(id, version, token);
    const root = await doc.getRoot().getView();

    const canvasDiv = document.createElement("div");
    const canvas = new controls.FlexView(canvasDiv, doc, root);
    host.attach(canvas);
}
