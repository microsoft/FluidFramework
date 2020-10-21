/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { fluidExport as TodoContainer } from "@fluid-example/todo";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { InsecureTinyliciousUrlResolver } from "@fluidframework/get-tinylicious-container";
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

export async function runInner(divId: string) {
    const div = document.getElementById(divId) as HTMLDivElement;

    const urlResolver = new InsecureTinyliciousUrlResolver();
    const documentServiceFactory = await InnerDocumentServiceFactory.create();
    const module = { fluidExport: TodoContainer };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    const url = documentServiceFactory.resolvedUrl.url;
    const documentId = decodeURIComponent(url.replace("fluid://localhost:3000/tinylicious/", ""));
    const container = await loader.resolve({ url: documentId });

    await getFluidObjectAndRender(container, div).catch(() => { });
    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", (value) => {
        getFluidObjectAndRender(container, div).catch(() => { });
    });
}
