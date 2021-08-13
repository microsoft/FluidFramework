/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { SharedMap } from "@fluid-experimental/fluid-framework";
import { DOProviderContainerRuntimeFactory } from "@fluidframework/fluid-static";
import { getSessionStorageContainer } from "@fluid-experimental/get-container";

import { DiceRollerController } from "../src/controller";
import { renderDiceRoller } from "../src/view";

// Since this is a single page Fluid application we are generating a new document id
// if one was not provided
let createNew = false;
if (window.location.hash.length === 0) {
    createNew = true;
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);

export const containerConfig = {
    name: "dice-roller-container",
    initialObjects: {
        /* [id]: DataObject */
        map1: SharedMap,
        map2: SharedMap,
    },
};

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement, createNewFlag: boolean) {
    // The SessionStorage Container is an in-memory Fluid container that uses the local browser SessionStorage
    // to store ops.
    const container = await getSessionStorageContainer(
        documentId,
        new DOProviderContainerRuntimeFactory(containerConfig),
        createNewFlag,
    );

    // Get the Default Object from the Container
    const fluidContainer = (await container.request({ url: "/" })).value;
    // We now get the DataObject from the container
    const sharedMap1 = fluidContainer.initialObjects.map1 as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(sharedMap1);
    await diceRollerController.initialize(createNew);

    // We render a view which uses the controller.
    const div1 = document.createElement("div");
    element.appendChild(div1);
    renderDiceRoller(diceRollerController, div1);

    // We now get the DataObject from the container
    const sharedMap2 = fluidContainer.initialObjects.map2 as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController2 = new DiceRollerController(sharedMap2);
    await diceRollerController2.initialize(createNew);

    const div2 = document.createElement("div");
    element.appendChild(div2);
    // We render a view which uses the controller.
    renderDiceRoller(diceRollerController2, div2);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
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
