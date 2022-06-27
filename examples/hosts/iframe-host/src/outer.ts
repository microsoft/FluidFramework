/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { FluidObject } from "@fluidframework/core-interfaces";
import { InsecureTinyliciousUrlResolver } from "@fluidframework/tinylicious-driver";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerProxy } from "./containerProxy";
import {
    IFrameInnerApi,
    IFrameOuterHost,
} from "./inframehost";

let createNew = false;
const getDocumentId = () => {
    if (window.location.hash.length === 0) {
        createNew = true;
        window.location.hash = Date.now().toString();
    }
    return window.location.hash.substring(1);
};

export async function loadFrame(
    iframeDivId: string,
    dataStoreDivId: string,
    logDivId: string,
    tinyliciousPort?: number,
) {
    const documentId = getDocumentId();
    const iframeDiv = document.getElementById(iframeDivId) as HTMLIFrameElement;
    const iframe = document.createElement("iframe");
    iframe.src = "/inner.html";
    // TODO: remove "allow-same-origin"
    iframe.sandbox.add("allow-scripts", "allow-forms", "allow-same-origin");
    iframeDiv.appendChild(iframe);

    const urlResolver = new InsecureTinyliciousUrlResolver(tinyliciousPort);

    const tokenProvider = new InsecureTokenProvider("12345", { id: "userid0" });
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    const innerPort = await host.loadOuterProxy(iframe);

    iframe.addEventListener("load", function loadFn() {
        void (async () => {
            // TODO: Inner IFrame exposes its API on its contentWindow currently while outer IFrame
            // exposes it through a MessageChannel.  MessageChannel supports two-way communication
            // but Comlink does not, so use two one-way paths until we have a two-way wrapper that
            // doesn't use naked postMessage

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const innerApi = Comlink.wrap<IFrameInnerApi>(Comlink.windowEndpoint(iframe.contentWindow!));
            await innerApi.setMessagePort(Comlink.transfer(innerPort, [innerPort]));

            // load the code inside the iframe but attach it here outside
            const containerProxy = await ContainerProxy.create(innerApi, documentId, createNew);
            if (createNew) {
                await containerProxy.attach({ url: documentId });
            }

            const container = await host.loadContainer({ url: documentId });
            await loadOuterLogDiv(container, logDivId);

            await loadOuterDataStoreDiv(dataStoreDivId);

            iframe.removeEventListener("load", loadFn);
        })();
    });
}

async function getFluidObjectAndRender(container: IContainer, div: HTMLDivElement) {
    const response = await container.request({ url: "/" });
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return undefined;
    }
    const fluidObject: FluidObject = response.value;

    // Render the Fluid object with an HTMLViewAdapter to abstract the UI framework used by the Fluid object
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

async function loadOuterLogDiv(
    container: IContainer,
    logDivId: string,
): Promise<void> {
    const logDiv = document.getElementById(logDivId) as HTMLDivElement;

    const log =
        (emitter: { on(event: string, listener: (...args: any[]) => void); }, name: string, ...events: string[]) => {
            events.forEach((event) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                emitter.on(event, (...args) => {
                    logDiv.innerHTML += `${name}: ${event}: ${JSON.stringify(args)}<br/>`;
                }));
        };

    const quorum = container.getQuorum();
    quorum.getMembers().forEach((client) => { logDiv.innerHTML += `Quorum: client: ${JSON.stringify(client)}<br/>`; });
    log(quorum, "Quorum", "error", "addMember", "removeMember");
    log(container, "Container", "error", "connected", "disconnected");
}

/**
 * Verify that the iframe container may be loaded in a regular, non-iframe environment
 * @param dataStoreDivId - the ID of the data store div
 */
async function loadOuterDataStoreDiv(
    dataStoreDivId: string,
): Promise<void> {
    const [container] = await getTinyliciousContainer(
        getDocumentId(),
        TodoContainer,
        // The container is always expected to have been created here
        false /* createNew */,
    );

    const dataStoreDiv = document.getElementById(dataStoreDivId) as HTMLDivElement;
    getFluidObjectAndRender(container, dataStoreDiv).catch(() => { });
    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, dataStoreDiv).catch(() => { });
    });
}

export async function runOuter(iframeDivId: string, divId: string, logId: string) {
    await loadFrame(iframeDivId, divId, logId);
}
