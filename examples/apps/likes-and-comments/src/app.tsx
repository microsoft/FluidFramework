/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";

import { LikesAndComments } from "./fluidObject";
import { LikesAndCommentsContainer } from "./container";

// Since this is a single page Fluid application we are generating a new document id
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
    const container = await getTinyliciousContainer(documentId, LikesAndCommentsContainer, createNew);

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<LikesAndComments>(container);

    const contentDiv = document.getElementById("content");
    if (contentDiv !== null) {
        defaultObject.render(contentDiv);
    }

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

start().catch((e) => {
    console.error(e);
    console.log(
        "%cEnsure you are running the Tinylicious Fluid Server",
        "font-size:30px");
});
