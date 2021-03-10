/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import Fluid, { FluidCreateContainerConfig } from "@fluid-experimental/fluid-static";
import { TinyliciousService } from "@fluid-experimental/get-container";
import { DiceRollerController } from "./controller";
import { renderDiceRoller } from "./view";

const service = new TinyliciousService();
Fluid.init(service);

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const containerId = location.hash.substring(1);
document.title = containerId;

const dataObjectId = "dice";

async function start(): Promise<void> {
    const containerConfig: FluidCreateContainerConfig = {
        id: containerId,
        dataObjects: [KeyValueDataObject],
        initialDataObjects: [[dataObjectId, KeyValueDataObject]],
    };
    // Get or create the document
    const fluidContainer = createNew
        ? await Fluid.createContainer(containerConfig)
        : await Fluid.getContainer(containerConfig);

    // We now get the DataObject from the container
    const keyValueDataObject = await fluidContainer.getDataObject<KeyValueDataObject>(dataObjectId);

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(keyValueDataObject);
    await diceRollerController.initialize(createNew);

    // We render a view which uses the controller.
    const div = document.getElementById("content") as HTMLDivElement;
    renderDiceRoller(diceRollerController, div);
}

start().catch((error) => console.error(error));
