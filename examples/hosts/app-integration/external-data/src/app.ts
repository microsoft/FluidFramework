/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousService } from "@fluid-experimental/get-container";
import { Container, Loader } from "@fluidframework/container-loader";

import { InventoryListContainerRuntimeFactory } from "./containerCode";
import { IInventoryList } from "./dataObject";
import { inventoryData } from "./externalData";
import { renderInventoryList as renderInventoryList } from "./view";

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

function getExternalData() {
    const itemStrings = inventoryData.split("\n");
    return itemStrings.map((itemString) => {
        const [itemNameString, itemQuantityString] = itemString.split(":");
        return { name: itemNameString, quantity: parseInt(itemQuantityString, 10) };
    });
}

async function initializeFromData(container: Container) {
    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our dice roller is available at the URL "/".
    const url = "/";
    const response = await container.request({ url });

    // Verify the response to make sure we got what we expected.
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    const itemData = getExternalData();

    // In this app, we know our container code provides a default data object that is an IDiceRoller.
    const inventoryList: IInventoryList = response.value;
    for (const { name, quantity } of itemData) {
        inventoryList.addItem(name, quantity);
    }
}

async function start(): Promise<void> {
    const tinyliciousService = new TinyliciousService();

    const module = { fluidExport: InventoryListContainerRuntimeFactory };
    const codeLoader = { load: async () => module };

    const loader = new Loader({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader,
    });

    let container: Container;

    if (createNew) {
        // We're not actually using the code proposal (our code loader always loads the same module regardless of the
        // proposal), but the Container will only give us a NullRuntime if there's no proposal.  So we'll use a fake
        // proposal.
        container = await loader.createDetachedContainer({ package: "no-dynamic-package", config: {} });
        await initializeFromData(container);
        await container.attach({ url: documentId });
    } else {
        // Request must be appropriate and parseable by resolver.
        container = await loader.resolve({ url: documentId });
    }

    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our inventory list is available at the URL "/".
    const url = "/";
    const response = await container.request({ url });

    // Verify the response to make sure we got what we expected.
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    // In this app, we know our container code provides a default data object that is an IInventoryList.
    const inventoryList: IInventoryList = response.value;

    // Given an IInventoryList, we can render the list and provide controls for users to modify it.
    const div = document.getElementById("content") as HTMLDivElement;
    renderInventoryList(inventoryList, div);
}

start().catch((error) => console.error(error));
