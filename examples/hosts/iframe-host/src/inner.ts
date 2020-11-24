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

async function loadFluidObject(
    divId: string,
    documentId: string,
    createNew: boolean,
) {
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
        await container.attach({ url: documentId });
        // TODO: Proxy outer attach call
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

    const componentDiv = document.getElementById(divId) as HTMLDivElement;
    await getFluidObjectAndRender(container, componentDiv).catch(() => { });
    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, componentDiv).catch(() => { });
    });
}

export async function runInner(divId: string) {
    // expose the entrypoint on the iframe window to load a Fluid object
    (window as any).loadFluidObject = async (documentId, createNew) => {
        return loadFluidObject(divId, documentId, createNew);
    };
}
