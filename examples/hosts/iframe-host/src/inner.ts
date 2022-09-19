/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Comlink from "comlink";
import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { IContainer, IFluidModuleWithDetails } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@fluidframework/iframe-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFrameInnerApi } from "./inframehost";

let innerPort: MessagePort;
const containers: Map<string, IContainer> = new Map();

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

async function loadFluidObject(
    divId: string,
    container: IContainer,
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

    const load = async (): Promise<IFluidModuleWithDetails> => {
        return {
            module: { fluidExport: TodoContainer },
            details: { package: "no-dynamic-package", config: {} },
        };
    };

    const codeLoader = { load };

    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    // TODO: drive new/existing creation entirely from outer
    const container = await (createNew
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the IContainer will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        // Caller is responsible for attaching the created container
        ? loader.createDetachedContainer({ package: "no-dynamic-package", config: {} })
        // Request must be appropriate and parseable by resolver.
        : loader.resolve({ url: documentId }));

    await loadFluidObject(divId, container);
    const containerId = (container.resolvedUrl as IFluidResolvedUrl).id;
    containers.set(containerId, container);

    return containerId;
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
