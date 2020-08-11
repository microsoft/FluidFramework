/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";

import { DraftJsObject } from "./fluid-object";
import { DraftJsContainer } from "./container";

// Re-export everything
export { DraftJsObject, DraftJsContainer };

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
async function start() {
    // Get the Fluid Container associated with the provided id
    const container = await getTinyliciousContainer(documentId, DraftJsContainer, createNew);

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<DraftJsObject>(container);

    // For now we will just reach into the FluidObject to render it
    defaultObject.render(document.getElementById("content"));
}

start().catch((e) => {
    console.error(e);
    console.log(
        "%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
        "font-size:30px");
});
