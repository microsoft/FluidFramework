/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";

import { DiceRollerController } from "./controller";
import {
    Fluid,
    IKeyValueDataObject,
    KeyValueDataObject,
    KeyValueInstantiationFactory,
} from "./kvpair-dataobject";
import { renderDiceRoller } from "./view";
// import { renderDiceRoller } from "./reactView";

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

async function start(): Promise<void> {
    // Get Fluid Container (creates if new url)
    const container = createNew
        ? await Fluid.createContainer(documentId)
        : await Fluid.getContainer(documentId);

    // Using the create handler, we can create our data object using a specific request shape.
    const dataObjectId = "dice";
    if (createNew) {
        await container.request({ url: `/create/${KeyValueInstantiationFactory.type}/${dataObjectId}` });
    }

    const keyValueDataObject: IKeyValueDataObject =
        await getObjectWithIdFromContainer<KeyValueDataObject>(dataObjectId, container);
    const diceRollerController = new DiceRollerController(keyValueDataObject);
    await diceRollerController.initialize(createNew);

    // Given an IDiceRoller, we can render the value and provide controls for users to roll it.
    const div = document.getElementById("content") as HTMLDivElement;
    renderDiceRoller(diceRollerController, div);
}

start().catch((error) => console.error(error));
