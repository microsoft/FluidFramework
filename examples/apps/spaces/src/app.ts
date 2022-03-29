/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";
import React from "react";
import ReactDOM from "react-dom";

import { Spaces, SpacesView } from "./fluid-object";
import { SpacesContainer } from "./container";

// Re-export everything
export { Spaces as SpacesExample, SpacesContainer };

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    // Get the Fluid Container associated with the provided id
    const [container, containerId] = await getTinyliciousContainer(documentId, SpacesContainer, shouldCreateNew);

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<Spaces>(container);

    // For now we will just reach into the FluidObject to render it
    const contentDiv = document.getElementById("content");
    if (contentDiv !== null) {
        ReactDOM.render(
            React.createElement(SpacesView, { model: defaultObject }),
            contentDiv,
        );
    }

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

start().catch((e) => {
    console.error(e);
    console.log("%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`", "font-size:30px");
});
