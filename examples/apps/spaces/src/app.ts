/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";
import React from "react";
import ReactDOM from "react-dom";

import { DataObjectGridContainer } from "./container";
import { IDataObjectGrid } from "./dataObjectGrid";
import { DataObjectGridAppView } from "./dataObjectGridView";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    // Get the Fluid Container associated with the provided id
    const [container, containerId] = await getTinyliciousContainer(
        documentId,
        DataObjectGridContainer,
        shouldCreateNew,
    );

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<IDataObjectGrid>(container);
    const contentDiv = document.getElementById("content") as HTMLDivElement;

    const parsedUrl = new URL(window.location.href);
    const requestedItemId = parsedUrl.searchParams.get("item") ?? undefined;
    if (requestedItemId === undefined) {
        // For now we will just reach into the FluidObject to render it
        ReactDOM.render(
            React.createElement(
                DataObjectGridAppView,
                { model: defaultObject, getDirectUrl: (itemId: string) => `?item=${itemId}#${documentId}` },
            ),
            contentDiv,
        );
    } else {
        const item = defaultObject.getItem(requestedItemId);
        if (item === undefined) {
            throw new Error("Item not found");
        }
        const view = await defaultObject.getViewForItem(item);
        ReactDOM.render(
            view,
            contentDiv,
        );
    }
}

start().catch((e) => {
    console.error(e);
    console.log("%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`", "font-size:30px");
});
