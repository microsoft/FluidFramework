/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";
import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import _ from "lodash";
import { getFRSContainer, hasFRSEndpoints } from "./utils/getFRSContainer";

import { PropertyTreeContainerRuntimeFactory as ContainerFactory } from "./containerCode";
import { IPropertyTree } from "./dataObject";

// import { renderCheckoutView } from "./checkout_view";
import { renderApp, renderInspector } from "./view";

// In interacting with the service, we need to be explicit about whether we're creating a new document vs. loading
// an existing one.  We also need to provide the unique ID for the document we are creating or loading from.

// In this app, we'll choose to create a new document when navigating directly to http://localhost:8080.  For the ID,
// we'll choose to use the current timestamp.  We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:8080/#1596520748752.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

async function start(): Promise<void> {
    const content = document.getElementById("content") as HTMLDivElement;
    // const paths = await renderCheckoutView(content)

    // The getTinyliciousContainer helper function facilitates loading our container code into a Container and
    // connecting to a locally-running test service called Tinylicious.  This will look different when moving to a
    // production service, but ultimately we'll still be getting a reference to a Container object.  The helper
    // function takes the ID of the document we're creating or loading, the container code to load into it, and a
    // flag to specify whether we're creating a new document or loading an existing one.
    const container = hasFRSEndpoints() ?
        await getFRSContainer(documentId, ContainerFactory, createNew)
        : await getTinyliciousContainer(documentId, ContainerFactory, createNew);

    /* const options = {
        paths,
        clientFiltering: true
    }; */

    // TODO: options currently not supported
    const propertyTree: IPropertyTree = await getDefaultObjectFromContainer<IPropertyTree>(
        container,
        /* { options } */
    );

    // Render the actual sample
    const fluidBinder = renderApp(propertyTree, content);

    // Render property inspector
    renderInspector(fluidBinder, propertyTree);

    // Reload the page on any further hash changes, e.g. in case you want to paste in a different document ID.
    window.addEventListener("hashchange", () => {
        location.reload();
    });
}

start().catch((error) => console.error(error));
