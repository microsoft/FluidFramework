import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { IHost } from "@prague/container-definitions";
import { ContanierUrlResolver } from "@prague/routerlicious-host";
import { registerDocumentServices } from "./utils";

async function loadDocument(url: string, host: IHost): Promise<api.Document> {
    console.log("Loading in root document...");

    const document = await api.load(
        url,
        host,
        { encrypted: false });

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(url: string, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    const resolver = new ContanierUrlResolver(null, null);

    registerDocumentServices(config);

    const doc = await loadDocument(url, { resolver });
    const root = doc.getRoot();

    const canvasDiv = document.createElement("div");
    if (!doc.existing) {
        root.set("ink", doc.createStream());
    } else {
        await root.wait("ink");
    }

    const canvas = new controls.FlexView(canvasDiv, doc, root);
    host.attach(canvas);
}
