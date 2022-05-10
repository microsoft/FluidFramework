/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSessionStorageContainer } from "@fluid-experimental/get-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";

import React from "react";
import ReactDOM from "react-dom";

import { InventoryListView } from "../src/inventoryView";
import { InventoryList, InventoryListContainerRuntimeFactory } from "../src/version1";

// Since this is a single page Fluid application we are generating a new document id
// if one was not provided
let createNew = false;
if (window.location.hash.length === 0) {
    createNew = true;
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);

const containerRuntimeFactory = new InventoryListContainerRuntimeFactory();

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement, createNewFlag: boolean) {
    // The SessionStorage Container is an in-memory Fluid container that uses the local browser SessionStorage
    // to store ops.
    const container = await getSessionStorageContainer(documentId, containerRuntimeFactory, createNewFlag);

    // Get the Default Object from the Container
    const inventoryList = await getDefaultObjectFromContainer<InventoryList>(container);
    // This adds the item twice on each pageload (one for each of the side-by-sides) which isn't great
    // but doesn't really matter for testing.
    inventoryList.addItem("testName", 3);

    // Given an IInventoryList, we can render its data using the view we've created in our app.
    ReactDOM.render(<InventoryListView inventoryList={ inventoryList } />, element);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
    const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
    if (leftElement === null) {
        throw new Error("sbs-left does not exist");
    }
    await createContainerAndRenderInElement(leftElement, createNew);
    const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
    if (rightElement === null) {
        throw new Error("sbs-right does not exist");
    }
    // The second time we don't need to createNew because we know a Container exists.
    await createContainerAndRenderInElement(rightElement, false);
}

setup().catch((e)=> {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory Fluid Server",
        "font-size:30px");
});
