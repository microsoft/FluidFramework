/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { FluidTinylicious } from "@fluid-experimental/fluid-static";
import { ITinyliciousFileConfig } from "@fluid-experimental/get-container";
import { SharedMap } from "@fluidframework/map";
import { DiceRollerController } from "./controller";
import { renderDiceRoller } from "./view";

// Define the server we will be using and initialize Fluid
FluidTinylicious.init();

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const containerId = location.hash.substring(1);
document.title = containerId;

// Define the configuration of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
export const containerConfig = {
    name: "dice-roller-container",
    initialObjects: {
        /* [id]: DataObject */
        kvp: KeyValueDataObject,
        map: SharedMap,
    },
};

async function start(): Promise<void> {
    // Get or create the document depending if we are running through the create new flow
    const fileConfig: ITinyliciousFileConfig = {id: containerId};
    const fluidContainer = createNew
        ? await FluidTinylicious.createContainer(fileConfig, containerConfig)
        : await FluidTinylicious.getContainer(fileConfig, containerConfig);

    // We now get the DataObject from the container
    const keyValueDataObject = fluidContainer.initialObjects.kvp as KeyValueDataObject;

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(keyValueDataObject);
    await diceRollerController.initialize(createNew);

    // We render a view which uses the controller.
    const contentDiv = document.getElementById("content") as HTMLDivElement;
    const div1 = document.createElement("div");
    contentDiv.appendChild(div1);
    renderDiceRoller(diceRollerController, div1);

    // We now get the SharedMap from the container
    const sharedMap = fluidContainer.initialObjects.map as SharedMap;

    // Our controller manipulates the data object (model).
    const diceRollerController2 = new DiceRollerController(sharedMap);
    await diceRollerController2.initialize(createNew);

    const div2 = document.createElement("div");
    contentDiv.appendChild(div2);
    // We render a view which uses the controller.
    renderDiceRoller(diceRollerController2, div2);
}

start().catch((error) => console.error(error));
