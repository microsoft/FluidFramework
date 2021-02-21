/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IKeyValueDataObject,
    KeyValueDataObject,
    KeyValueInstantiationFactory,
} from "@fluid-experimental/data-objects";
import { Fluid } from "@fluid-experimental/fluid-static";
import { TinyliciousService } from "@fluid-experimental/get-container";
import { DiceRollerController } from "./controller";
import { renderDiceRoller } from "./view";

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

const dataObjectId = "dice";

async function start(): Promise<void> {
    const tinyliciousService = new TinyliciousService();
    // Get or create the document
    const fluidDocument = createNew
        ? await Fluid.createDocument(tinyliciousService, documentId, [KeyValueInstantiationFactory.registryEntry])
        : await Fluid.getDocument(tinyliciousService, documentId, [KeyValueInstantiationFactory.registryEntry]);

    // We'll create the data object when we create the new document.
    const keyValueDataObject: IKeyValueDataObject = createNew
        ? await fluidDocument.createDataObject<KeyValueDataObject>(KeyValueInstantiationFactory.type, dataObjectId)
        : await fluidDocument.getDataObject<KeyValueDataObject>(dataObjectId);

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(keyValueDataObject);
    await diceRollerController.initialize(createNew);

    // We render a view which uses the controller.
    const div = document.getElementById("content") as HTMLDivElement;
    renderDiceRoller(diceRollerController, div);
}

start().catch((error) => console.error(error));
