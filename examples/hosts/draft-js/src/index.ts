/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSessionStorageContainer } from "@fluidframework/get-session-storage-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";

import { DraftJsObject } from "./fluid-object";
import { DraftJsContainer } from "./container";

// Re-export everything
export { DraftJsObject as DraftJsExample, DraftJsContainer };

// Since this is a single page fluid application we are generating a new document id
// if one was not provided
let createNewFlag = false;
if (window.location.hash.length === 0) {
    createNewFlag = true;
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function start(id: string, createNew: boolean) {
    // Get the Fluid Container associated with the provided id
    const container = await getSessionStorageContainer(documentId, DraftJsContainer, createNew);

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<DraftJsObject>(container);

    // For now we will just reach into the FluidObject to render it
    defaultObject.render(document.getElementById(id));

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

export async function fluidTestSetup() {
    await start("context1", createNewFlag);
    // Create new is always false for the second window
    await start("context2", false);
}

fluidTestSetup().catch((e)=> {
    console.error(e);
    console.log(
        "%cSomething went wrong when trying to setup the local server",
        "font-size:30px");
    });
