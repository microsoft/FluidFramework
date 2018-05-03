import * as resources from "gitresources";
import * as agent from "../../agent";
import { api, socketStorage } from "../../client-api";
import { controls, ui } from "../../client-ui";

async function loadDocument(id: string, version: resources.ICommit): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: false /* api.isUserLoggedIn() */ }, version);

    console.log("Document loaded");
    return document;
}

export async function initialize(id: string, version: resources.ICommit, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl);

    // Bootstrap worker service.
    agent.registerWorker(config, "maps");

    const doc = await loadDocument(id, version);
    const root = doc.getRoot();

    const element = document.createElement("div");
    const canvas = new controls.YouTubeVideoCanvas(element, doc, root);
    host.attach(canvas);
}
