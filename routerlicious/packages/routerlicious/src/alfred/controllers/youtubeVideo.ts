import { api } from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import * as resources from "@prague/gitresources";
import { registerDocumentServices } from "./utils";

async function loadDocument(id: string, version: resources.ICommit, token: string, client: any): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: false, token }, version);

    console.log("Document loaded");
    return document;
}

export async function initialize(id: string, version: resources.ICommit, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    registerDocumentServices(config);

    const doc = await loadDocument(id, version, token, config.client);
    const root = doc.getRoot();

    const element = document.getElementById("player-div") as HTMLDivElement;

    const canvas = new controls.YouTubeVideoCanvas(element, doc, root);
    host.attach(canvas);
}
