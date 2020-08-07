/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSessionStorageContainer } from "@fluidframework/get-session-storage-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";

import { DraftJsObject } from "../src/fluid-object";
import { DraftJsContainer } from "../src/container";

// Re-export everything
export { DraftJsObject as DraftJsExample, DraftJsContainer };

// Since this is a single page fluid application we are generating a new document id
// if one was not provided
let createNew = false;
if (window.location.hash.length === 0) {
    createNew = true;
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(elementId: string, createNewFlag: boolean) {
    // Get the Fluid Container associated with the provided id
    const container = await getSessionStorageContainer(documentId, DraftJsContainer, createNewFlag);

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<DraftJsObject>(container);

    // For now we will just reach into the FluidObject to render it
    defaultObject.render(document.getElementById(elementId));

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

async function setup() {
    await createContainerAndRenderInElement("content1", createNew);
    await createContainerAndRenderInElement("content2", false);
}

setup().catch((e)=> {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory FLuid Server",
        "font-size:30px");
});
