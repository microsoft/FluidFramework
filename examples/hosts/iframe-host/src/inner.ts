/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { Container } from "@fluidframework/container-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import {
    getContainer,
    InsecureTinyliciousUrlResolver,
 } from "@fluidframework/get-tinylicious-container";
import { InnerDocumentServiceFactory } from "@fluidframework/iframe-driver";
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
    const componentDiv = document.getElementById(divId) as HTMLDivElement;

    const documentServiceFactory = await InnerDocumentServiceFactory.create();

    const urlResolver = new InsecureTinyliciousUrlResolver();

    const container = await getContainer(
        documentId,
        createNew,
        { url: documentId },
        urlResolver,
        documentServiceFactory,
        TodoContainer,
    );

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
