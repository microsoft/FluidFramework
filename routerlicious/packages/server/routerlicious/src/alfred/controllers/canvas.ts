import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { IHost } from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { ContanierUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { registerDocumentServices } from "./utils";

async function loadDocument(
    id: string,
    version: resources.ICommit,
    token: string,
    host: IHost,
    client: any): Promise<api.Document> {
    console.log("Loading in root document...");

    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);
    const document = await api.load(
        id,
        claims.tenantId,
        host,
        { encrypted: false },
        version);

    console.log("Document loaded");
    return document;
}

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(id: string, version: resources.ICommit, token: string, config: any) {
    const host = new ui.BrowserContainerHost();

    const resolver = new ContanierUrlResolver(null, null);
    const tokenProvider = new socketStorage.TokenProvider(token);

    registerDocumentServices(config);

    const doc = await loadDocument(id, version, token, { resolver, tokenProvider }, config.client);
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
