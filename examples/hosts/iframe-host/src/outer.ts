/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { Container } from "@fluidframework/container-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import {
    RouterliciousDocumentServiceFactory,
} from "@fluidframework/routerlicious-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import { IFrameOuterHost } from "./inframehost";

let createNew = false;
const getDocumentId = () => {
    if (window.location.hash.length === 0) {
        createNew = true;
        window.location.hash = Date.now().toString();
    }
    return window.location.hash.substring(1);
};
const getDocumentUrl = () => `${window.location.origin}/${getDocumentId()}`;
const getTinyliciousUrlResolver =
    () => new InsecureUrlResolver(
        "http://localhost:3000",
        "http://localhost:3000",
        "http://localhost:3000",
        "tinylicious",
        "12345",
        { id: "userid0" },
        "bearer");

export async function loadFrame(iframeId: string, logId: string) {
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;

    const urlResolver = getTinyliciousUrlResolver();

    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    const host = new IFrameOuterHost({
        urlResolver,
        documentServiceFactory,
    });

    const proxyContainer = await host.load(
        { url: getDocumentUrl() },
        iframe,
    );

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

    const container = await getTinyliciousContainer(
        getDocumentId(),
        TodoContainer,
        createNew,
    )

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
