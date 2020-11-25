/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import { InsecureTinyliciousUrlResolver } from "@fluidframework/get-tinylicious-container";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { IContainerProxy } from "./containerProxy";
import { IFrameOuterHost } from "./inframehost";

let createNew = false;
const getDocumentId = () => {
    if (window.location.hash.length === 0) {
        createNew = true;
        window.location.hash = Date.now().toString();
    }
    return window.location.hash.substring(1);
};

export async function loadFrame(iframeDivId: string, divId: string, logId: string) {
    const documentId = getDocumentId();
    const iframeDiv = document.getElementById(iframeDivId) as HTMLIFrameElement;
    const iframe = document.createElement("iframe");
    iframe.src = "/inner.html";
    iframeDiv.appendChild(iframe);

    const urlResolver = new InsecureTinyliciousUrlResolver();

    const tokenProvider = new InsecureTokenProvider("tinylicious", documentId, "12345", { id: "userid0" });
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    await host.loadOuterProxy(iframe);

    iframe.addEventListener("load", () => {
        void (async () => {
            // load the code inside the iframe but attach it here outside
            const containerProxy: IContainerProxy =
                await (iframe.contentWindow as any).loadContainer(documentId, createNew);
            if (createNew) {
                await containerProxy.attach({ url: documentId });
            }
            await (iframe.contentWindow as any).loadFluidObject(containerProxy);
            await loadOuterDataStoreAndLogDivs(containerProxy, logId, divId);
        })();
    });
}

async function getFluidObjectAndRender(container: IContainerProxy, div: HTMLDivElement) {
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

async function loadOuterDataStoreAndLogDivs(
    container: IContainerProxy,
    logDivId: string,
    dataStoreDivId: string,
): Promise<void> {
    const logDiv = document.getElementById(logDivId) as HTMLDivElement;

    const quorum = await container.getQuorum();
    if (!quorum.has("code")) {
        // we'll never propose the code, so wait for them to do it
        await new Promise((resolve) => {
            void container.once("contextChanged", () => resolve());
            return;
        });
    }

    const log =
        (emitter: { on(event: string, listener: (...args: any[]) => void) }, name: string, ...events: string[]) => {
            events.forEach((event) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                emitter.on(event, (...args) => {
                    logDiv.innerHTML += `${name}: ${event}: ${JSON.stringify(args)}<br/>`;
                }));
        };

    quorum.getMembers().forEach((client) => logDiv.innerHTML += `Quorum: client: ${JSON.stringify(client)}<br/>`);
    log(quorum, "Quorum", "error", "addMember", "removeMember");
    log(container, "Container", "error", "connected", "disconnected");

    const dataStoreDiv = document.getElementById(dataStoreDivId) as HTMLDivElement;
    getFluidObjectAndRender(container, dataStoreDiv).catch(() => {});
    // Handle the code upgrade scenario (which fires contextChanged)
    await container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, dataStoreDiv).catch(() => {});
    });
}

export async function runOuter(iframeDivId: string, divId: string, logId: string) {
    await loadFrame(iframeDivId, divId, logId);
}
