/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";
import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import React from "react";
import ReactDOM from "react-dom";

import { CollaborativeTextContainer } from "./container";
import { CollaborativeText } from "./fluid-object";
import { CollaborativeTextView } from "./view";

// Re-export everything
export { CollaborativeText as CollaborativeTextExample, CollaborativeTextContainer };

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    const [container, containerId] = await getTinyliciousContainer(
        documentId, CollaborativeTextContainer, shouldCreateNew,
    );

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<CollaborativeText>(container);

    // Render it
    const contentDiv = document.getElementById("content");
    if (contentDiv !== null) {
        ReactDOM.render(React.createElement(CollaborativeTextView, { text: defaultObject.text }), contentDiv);
    }
}

start().catch((e) => {
    console.error(e);
    console.log("%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`", "font-size:30px");
});
