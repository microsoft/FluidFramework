/* eslint-disable import/no-internal-modules */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSessionStorageContainer } from "@fluidframework/get-session-storage-container";
import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";

import { DiceRollerController } from "../src/controller";
import { DropletContainerRuntimeFactory, KeyValueDataObject, KeyValueInstantiationFactory } from "../src/kvpair-dataobject";
import { renderDiceRoller } from "../src/view";

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
export async function createContainerAndRenderInElement(element: HTMLDivElement, createNewFlag: boolean) {
    // The SessionStorage Container is an in-memory Fluid container that uses the local browser SessionStorage
    // to store ops.
    const container = await getSessionStorageContainer(documentId, DropletContainerRuntimeFactory, createNewFlag);

    // Get the Default Object from the Container
    const dataObjectId = "dice";
    if (createNewFlag) {
        await container.request({ url: `/create/${KeyValueInstantiationFactory.type}/${dataObjectId}` });
    }
    const kvPairDataObject = await getObjectWithIdFromContainer<KeyValueDataObject>(dataObjectId, container);
    const diceRollerController = new DiceRollerController(kvPairDataObject);
    await diceRollerController.initialize(createNewFlag);

    // Given an IDiceRoller, we can render its data using the view we've created in our app.
    renderDiceRoller(diceRollerController, element);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
    const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
    if (leftElement === undefined) {
        throw new Error("sbs-left does not exist");
    }
    await createContainerAndRenderInElement(leftElement, createNew);
    const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
    if (rightElement === undefined) {
        throw new Error("sbs-right does not exist");
    }
    // The second time we don't need to createNew because we know a Container exists.
    await createContainerAndRenderInElement(rightElement, false);
}

setup().catch((e)=> {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory FLuid Server",
        "font-size:30px");
});
