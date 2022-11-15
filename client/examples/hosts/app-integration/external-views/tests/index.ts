/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";

import { renderDiceRoller } from "../src/view";
import { DiceRollerContainerRuntimeFactory, IDiceRollerAppModel } from "../src/containerCode";

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
 async function createContainerAndRenderInElement(element: HTMLDivElement) {
    const sessionStorageModelLoader = new SessionStorageModelLoader<IDiceRollerAppModel>(
        new StaticCodeLoader(new DiceRollerContainerRuntimeFactory()),
    );

    let id: string;
    let model: IDiceRollerAppModel;

    if (location.hash.length === 0) {
        // Normally our code loader is expected to match up with the version passed here.
        // But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
        // the version doesn't actually matter.
        const createResponse = await sessionStorageModelLoader.createDetached("1.0");
        model = createResponse.model;
        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await sessionStorageModelLoader.loadExisting(id);
    }

    // update the browser URL and the window title with the actual container ID
    location.hash = id;
    document.title = id;

    // Render it
    renderDiceRoller(model.diceRoller, element);

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
    await createContainerAndRenderInElement(leftElement);
    const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
    if (rightElement === null) {
        throw new Error("sbs-right does not exist");
    }
    // The second time we don't need to createNew because we know a Container exists.
    await createContainerAndRenderInElement(rightElement);
}

setup().catch((e)=> {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory FLuid Server",
        "font-size:30px");
});
