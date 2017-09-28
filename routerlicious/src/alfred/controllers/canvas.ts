import * as resources from "gitresources";
import * as api from "../../api";
import { Canvas } from "../../controls";
import * as ink from "../../ink";
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

    const doc = await loadDocument(id, version);
    const root = await doc.getRoot().getView();

    // Bootstrap worker service.
    if (config.permission.canvas) {
        shared.registerWorker(config);
    }

    if (!root.has("ink")) {
        root.set("ink", doc.createInk());
    }

    if (!root.has("components")) {
        root.set("components", doc.createMap());
    }

    const canvasDiv = document.createElement("div");
    const canvas = new Canvas(canvasDiv, root.get("ink") as ink.IInk, root.get("components") as api.IMap);
    host.attach(canvas);
}
