import { api } from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import * as resources from "@prague/gitresources";
import { IMap } from "@prague/map";
import { registerDocumentServices } from "./utils";

async function loadDocument(id: string, version: resources.ICommit, token: string, client: any): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: false, token }, version);

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(id: string, version: resources.ICommit, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    registerDocumentServices(config);

    const doc = await loadDocument(id, version, token, config.client);
    const root = doc.getRoot();

    const graphDiv = document.createElement("div");
    const canvas = new controls.Graph(graphDiv, doc, await this.fetchGraphRoot(root, doc));
    host.attach(canvas);
}

export async function fetchGraphRoot(root: IMap, doc: api.Document): Promise<IMap> {
    const hasGraph = await root.has("graph");
    if (!hasGraph) {
        root.set("graph", doc.createMap());
    }
    return root.get("graph");
}
