/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { InsecureTinyliciousUrlResolver } from "@fluidframework/get-tinylicious-container";
import {
    RouterliciousDocumentServiceFactory,
} from "@fluidframework/routerlicious-driver";
// import { InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFrameOuterHost } from "./inframehost";

const documentId = `testdoc${Math.floor(Math.random() * 10000)}`;

export async function loadFrame(iframeId: string, logId: string) {
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;

    const urlResolver = new InsecureTinyliciousUrlResolver();

    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    const proxyContainer = await host.load({ url: documentId }, iframe);

    const text = document.getElementById(logId) as HTMLDivElement;
    const quorum = proxyContainer.getQuorum();

    const log =
        (emitter: { on(event: string, listener: (...args: any[]) => void) }, name: string, ...events: string[]) => {
            events.forEach((event) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                emitter.on(event, (...args) => {
                    text.innerHTML += `${name}: ${event}: ${JSON.stringify(args)}<br/>`;
                }));
        };

    quorum.getMembers().forEach((client) => text.innerHTML += `Quorum: client: ${JSON.stringify(client)}<br/>`);
    log(quorum, "Quorum", "error", "addMember", "removeMember");
    log(proxyContainer, "Container", "error", "connected", "disconnected");
}

async function getFluidObjectAndRender(container: Container, div: HTMLDivElement) {
    const response = await container.request({ url: "/" });
    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "fluid/object"
        )) {
        return undefined;
    }
    const fluidObject = response.value as IFluidObject;

    // Render the Fluid object with an HTMLViewAdapter to abstract the UI framework used by the Fluid object
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

export async function loadDiv(divId: string) {
    const div = document.getElementById(divId) as HTMLDivElement;

    const urlResolver = new InsecureTinyliciousUrlResolver();

    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    // Dummy code details that won't really get used
    const codeDetails: IFluidCodeDetails = {
        package: "@fluid-example/todo",
        config: { },
    };

    const module = { fluidExport: TodoContainer };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    const container = await loader.createDetachedContainer(codeDetails);
    await container.attach({ url: documentId });

    await getFluidObjectAndRender(container, div).catch(() => { });
    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, div).catch(() => { });
    });
}

export async function runOuter(iframeId: string, divId: string, logId: string) {
    await Promise.all([
        loadFrame(iframeId, logId),
        loadDiv(divId).catch(),
    ]);
}
