/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import {
    InnerDocumentServiceFactory,
    InnerUrlResolver,
} from "@fluidframework/iframe-driver";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IContainerProxy, MakeContainerProxy } from "./containerProxy";

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

async function loadContainer(
    documentId: string,
    createNew: boolean,
): Promise<IContainerProxy> {
    const documentServiceFactory = await InnerDocumentServiceFactory.create();
    const urlResolver = await InnerUrlResolver.create();

    const module = { fluidExport: TodoContainer };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    let container: Container;

    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        // Caller is responsible for attaching the created container
    } else {
        // Request must be appropriate and parseable by resolver.
        container = await loader.resolve({ url: documentId });
        // If we didn't create the container properly, then it won't function correctly.  So we'll throw if we got a
        // new container here, where we expect this to be loading an existing container.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!container.existing) {
            throw new Error("Attempted to load a non-existing container");
        }
    }

    return MakeContainerProxy(container);
}

async function loadFluidObject(
    divId: string,
    containerProxy: IContainerProxy,
) {
    const componentDiv = document.getElementById(divId) as HTMLDivElement;
    await getFluidObjectAndRender(containerProxy, componentDiv).catch(() => { });
    // Handle the code upgrade scenario (which fires contextChanged)
    await containerProxy.on("contextChanged", (value) => {
        getFluidObjectAndRender(containerProxy, componentDiv).catch(() => { });
    });
}

export async function runInner(divId: string) {
    // expose the entrypoints on the iframe window to load a Fluid object
    (window as any).loadContainer = async (documentId, createNew) => {
        return loadContainer(documentId, createNew);
    };
    (window as any).loadFluidObject = async (containerProxy) => {
        return loadFluidObject(divId, containerProxy);
    };
}
