/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSessionStorageContainer } from "@fluidframework/get-session-storage-container";
import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { PrettyDiceRollerView } from "../src/app/views";
import {
    DiceRoller,
    DiceRollerContainerRuntimeFactory,
} from "../src";

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
    // The SessionStorage Container is an in-memory Fluid container that uses the SessionSession storage
    // to store ops.
    const container = await getSessionStorageContainer(documentId, DiceRollerContainerRuntimeFactory, createNewFlag);

    // Get the Default Object from the Container
    const defaultObject = await getDefaultObjectFromContainer<DiceRoller>(container);

    // For now we will just reach into the FluidObject to render it
    // defaultObject.render(document.getElementById(elementId));

    const div = document.getElementById(elementId) as HTMLDivElement;
    ReactDOM.render(React.createElement(PrettyDiceRollerView, { model: defaultObject }), div);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
    await createContainerAndRenderInElement("content1", createNew);
    // The second time we don't need to createNew because we know a Container
    // object exists.
    await createContainerAndRenderInElement("content2", false);
}

setup().catch((e)=> {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory FLuid Server",
        "font-size:30px");
});
