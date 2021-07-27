/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSessionStorageContainer } from "@fluid-experimental/get-container";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { oldestClientDiceId, taskManagerDiceId, TaskSelectionFactory } from "../src/containerCode";
import { IDiceRoller } from "../src/interface";
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
    const container = await getSessionStorageContainer(documentId, TaskSelectionFactory, createNewFlag);

    // We'll use a separate dice roller for each methodology.
    const taskManagerDiceRoller = await requestFluidObject<IDiceRoller>(container, taskManagerDiceId);
    const oldestClientDiceRoller = await requestFluidObject<IDiceRoller>(container, oldestClientDiceId);

    // Demo 1: Using TaskManager
    const taskManagerDiv = document.createElement("div");
    const taskManagerHeaderDiv = document.createElement("div");
    taskManagerHeaderDiv.style.textAlign = "center";
    taskManagerHeaderDiv.style.fontSize = "50px";
    taskManagerHeaderDiv.textContent = "TaskManager";
    const taskManagerViewDiv = document.createElement("div");
    renderDiceRoller(taskManagerDiceRoller, taskManagerViewDiv);
    taskManagerDiv.append(taskManagerHeaderDiv, taskManagerViewDiv);

    const divider = document.createElement("hr");

    // Demo 2: Using OldestClientObserver
    const oldestClientDiv = document.createElement("div");
    const oldestClientHeaderDiv = document.createElement("div");
    oldestClientHeaderDiv.style.textAlign = "center";
    oldestClientHeaderDiv.style.fontSize = "50px";
    oldestClientHeaderDiv.textContent = "OldestClientObserver";
    const oldestClientViewDiv = document.createElement("div");
    renderDiceRoller(oldestClientDiceRoller, oldestClientViewDiv);
    oldestClientDiv.append(oldestClientHeaderDiv, oldestClientViewDiv);

    element.append(taskManagerDiv, divider, oldestClientDiv);

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
    await createContainerAndRenderInElement(leftElement, createNew);
    const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
    if (rightElement === null) {
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
