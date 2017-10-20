import * as resources from "gitresources";
import * as api from "../../api";
import { FlexView } from "../../controls";
import * as shared from "../../shared";
import * as socketStorage from "../../socket-storage";
import * as ui from "../../ui";

async function loadDocument(id: string, version: resources.ICommit): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: api.isUserLoggedIn() }, version);

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(id: string, version: resources.ICommit, config: any) {
    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl, config.repository);

    // Bootstrap worker service.
    shared.registerWorker(config, "canvas");

    const doc = await loadDocument(id, version);
    const root = await doc.getRoot().getView();

    const canvasDiv = document.createElement("div");
    const canvas = new FlexView(canvasDiv, doc, root);
    host.attach(canvas);
}
