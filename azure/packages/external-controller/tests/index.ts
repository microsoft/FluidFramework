/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */
import { SharedMap } from "fluid-framework";

import { DOProviderContainerRuntimeFactory, FluidContainer } from "@fluidframework/fluid-static";

import { getSessionStorageContainer } from "@fluid-experimental/get-container";

import { DiceRollerController } from "../src/controller";
import { makeAppView } from "../src/view";

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

async function initializeNewContainer(container: FluidContainer): Promise<void> {
    // We now get the first SharedMap from the container
    const sharedMap1 = container.initialObjects.map1 as SharedMap;
    const sharedMap2 = container.initialObjects.map2 as SharedMap;
    await Promise.all([
        DiceRollerController.initializeModel(sharedMap1),
        DiceRollerController.initializeModel(sharedMap2),
    ]);
}

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(
    element: HTMLDivElement,
    createNewFlag: boolean,
) {
    // The SessionStorage Container is an in-memory Fluid container that uses the local browser SessionStorage
    // to store ops.
    const container = await getSessionStorageContainer(
        documentId,
        new DOProviderContainerRuntimeFactory(containerConfig),
        createNewFlag,
    );

    // Get the Default Object from the Container
    const fluidContainer = (await container.request({ url: "/" })).value;
    if (createNewFlag) {
        await initializeNewContainer(fluidContainer);
    }

    const sharedMap1 = fluidContainer.initialObjects.map1 as SharedMap;
    const sharedMap2 = fluidContainer.initialObjects.map2 as SharedMap;
    const diceRollerController = new DiceRollerController(sharedMap1);
    const diceRollerController2 = new DiceRollerController(sharedMap2);

    element.append(makeAppView([diceRollerController, diceRollerController2]));

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

setup().catch((e) => {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory FLuid Server",
        "font-size:30px",
    );
});
