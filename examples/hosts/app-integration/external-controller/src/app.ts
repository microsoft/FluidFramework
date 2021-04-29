/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AttachState } from "@fluidframework/container-definitions";
import { KeyValueDataObject } from "@fluid-experimental/data-objects";
import { FluidContainer } from "@fluid-experimental/fluid-static";
import TinyliciousClient, { TinyliciousContainerConfig } from "@fluid-experimental/tinylicious-client";
import { SharedMap } from "@fluidframework/map";
import { DiceRollerController } from "./controller";
import { renderDiceRoller } from "./view";

// Define the server we will be using and initialize Fluid
TinyliciousClient.init();

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const containerId = location.hash.substring(1);
document.title = containerId;

// Parses the url to see if "detached" was passed as a query param to create the container in
// a detached state
const urlParams = new URLSearchParams(window.location.search);
const isDetached = urlParams.get("detached");

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
export const containerSchema = {
    name: "dice-roller-container",
    initialObjects: {
        /* [id]: DataObject */
        kvp: KeyValueDataObject,
        map: SharedMap,
    },
};

const containerConfig: TinyliciousContainerConfig = { id: containerId };

async function start(): Promise<void> {
    // Get or create the document depending if we are running through the create new flow
    const fluidContainer = createNew
        ? isDetached !== undefined /** Check to see if container should be created in detached state */
            ? await TinyliciousClient.createDetachedContainer(
                containerSchema,
            )
            : await TinyliciousClient.createContainer(
                containerConfig,
                containerSchema,
            )
        : await TinyliciousClient.getContainer(
            containerConfig,
            containerSchema,
        );

    // We prepare our view to render the contents of the container
    const contentDiv = document.getElementById("content") as HTMLDivElement;
    contentDiv.style.textAlign = "center";

    // If the container is created in a detached state, we display a button that will attach it to the service.
    if (fluidContainer.attachState === AttachState.Detached) {
        renderAttachButton(fluidContainer, contentDiv);
    }

    // We now get the DataObject from the container
    const keyValueDataObject = fluidContainer.initialObjects
        .kvp as KeyValueDataObject;

    // Our controller manipulates the data object (model).
    const diceRollerController = new DiceRollerController(keyValueDataObject);
    await diceRollerController.initialize(createNew);

    // We render our DiceRollerController
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

function renderAttachButton(
    fluidContainer: FluidContainer<TinyliciousContainerConfig>,
    contentDiv: HTMLDivElement,
): void {
    const attachButton = document.createElement("button");
    attachButton.style.fontSize = "30px";
    attachButton.style.margin = "20px";
    attachButton.textContent = "Attach to Service";
    attachButton.addEventListener("click", () => {
        // Once the container is attached, the button will be disabled as there is no further action to take
        fluidContainer.attachToService(containerConfig).then(() => {
            if (fluidContainer.attachState === AttachState.Attached) {
                attachButton.disabled = true;
                attachButton.textContent = "Successfully Attached";
            } else {
                // If attach succeeds, we should never reach this state as the fluidContainer's attachState will
                // also be updated
                throw Error("Attach state failed to updated");
            }
        }).catch((e: Error) => {
            console.error(`Failed to attach container due to error ${e.message}`);
        });
    });
    contentDiv.appendChild(attachButton);
}

start().catch((error) => console.error(error));
