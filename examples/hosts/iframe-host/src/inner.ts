/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidObject, IRequest } from "@fluidframework/core-interfaces";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@fluidframework/iframe-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFrameInnerApi } from "./inframehost";

let innerPort: MessagePort;
const containers: Map<string, Container> = new Map();

async function getFluidObjectAndRender(container: Container, div: HTMLDivElement) {
    const response = await container.request({ url: "/" });
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return undefined;
    }
    const fluidObject = response.value as IFluidObject;

    // Render the Fluid object with an HTMLViewAdapter to abstract the UI framework used by the Fluid object
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

async function loadFluidObject(
    divId: string,
    container: Container,
) {
    const componentDiv = document.getElementById(divId) as HTMLDivElement;
    await getFluidObjectAndRender(container, componentDiv).catch(() => { });
    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, componentDiv).catch(() => { });
    });
}

async function loadContainer(
    documentId: string,
    createNew: boolean,
    divId: string,
): Promise<string> {
    const documentServiceFactory = await InnerDocumentServiceFactory.create(innerPort);
    const urlResolver = await InnerUrlResolver.create(innerPort);

    const module = { fluidExport: TodoContainer };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    let container: Container;

    // TODO: drive new/existing creation entirely from outer
    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        // Caller is responsible for attaching the created container
    } else {
        // Request must be appropriate and parseable by resolver.
        container = await loader.resolve({ url: documentId });
    }

    await loadFluidObject(divId, container);
    containers.set(container.id, container);

    return container.id;
}

async function attachContainer(
    containerId: string,
    request: IRequest,
): Promise<void> {
    const container = containers.get(containerId);
    if (container === undefined) {
        throw new Error(`container with provided id: ${containerId} not found`);
    }
    await container.attach(request);
}

export async function runInner(divId: string) {
    const innerApi: IFrameInnerApi = {
        setMessagePort: Comlink.proxy(async (port2) => {
            innerPort = port2;
        }),
        loadContainer: Comlink.proxy(async (documentId, createNew) => loadContainer(documentId, createNew, "content")),
        attachContainer: Comlink.proxy(async (containerId, request) => attachContainer(containerId, request)),
    };

    Comlink.expose(innerApi, Comlink.windowEndpoint(window.parent));
}
