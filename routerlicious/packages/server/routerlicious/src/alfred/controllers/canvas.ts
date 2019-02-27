import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { IPragueResolvedUrl, IResolvedUrl } from "@prague/container-definitions";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { registerDocumentServices } from "./utils";

// throttle resize events and replace with an optimized version
ui.throttle("resize", "throttled-resize");

export async function initialize(resolved: IPragueResolvedUrl, jwt: string, config: any) {
    const host = new ui.BrowserContainerHost();

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[resolved.url, resolved]]));

    registerDocumentServices(config);

    const doc = await api.load(
        resolved.url,
        { resolver },
        { encrypted: false });
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
