/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { Container } from "@fluidframework/container-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import {
    RouterliciousDocumentServiceFactory,
} from "@fluidframework/routerlicious-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { InsecureTokenProvider, InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { IFrameOuterHost } from "./inframehost";

let createNew = false;
const getDocumentId = () => {
    if (window.location.hash.length === 0) {
        createNew = true;
        window.location.hash = Date.now().toString();
    }
    return window.location.hash.substring(1);
};
const getDocumentUrl = (documentId: string) => `${window.location.origin}/${documentId}`;
const getTinyliciousUrlResolver =
    () => new InsecureUrlResolver(
        "http://localhost:3000",
        "http://localhost:3000",
        "http://localhost:3000",
        "tinylicious",
        "bearer");

export async function loadFrame(iframeDivId: string, divId: string, logId: string) {
    const documentId = getDocumentId();
    const iframeDiv = document.getElementById(iframeDivId) as HTMLIFrameElement;
    const iframe = document.createElement("iframe");
    iframe.src = "/inner.html";
    iframeDiv.appendChild(iframe);

    const urlResolver = getTinyliciousUrlResolver();

    const tokenProvider = new InsecureTokenProvider("tinylicious", documentId, "12345", { id: "userid0" });
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

    const module = { fluidExport: TodoContainer };
    const codeLoader = { load: async () => module };

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    await host.loadOuterProxy(iframe);

    iframe.addEventListener("load", () => {
        void (async () => {
            await (iframe.contentWindow as any).loadFluidObject(documentId, createNew);
            // don't try to connect until the iframe does, so they get existing false
            const container = await host.getContainerForRequest({ url: getDocumentUrl(documentId) });
            await loadOuterDataStoreAndLogDivs(container, logId, divId);
        })();
    });
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

async function loadOuterDataStoreAndLogDivs(
    container: Container,
    logDivId: string,
    dataStoreDivId: string,
): Promise<void> {
    const logDiv = document.getElementById(logDivId) as HTMLDivElement;

    if (!container.getQuorum().has("code")) {
        // we'll never propose the code, so wait for them to do it
        await new Promise((resolve) => container.once("contextChanged", () => resolve()));
    }

    const quorum = container.getQuorum();
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
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, dataStoreDiv).catch(() => {});
    });
}

export async function runOuter(iframeDivId: string, divId: string, logId: string) {
    await loadFrame(iframeDivId, divId, logId);
}
