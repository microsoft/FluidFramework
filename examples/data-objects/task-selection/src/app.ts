/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { oldestClientDiceId, taskManagerDiceId, TaskSelectionFactory } from "./containerCode";
import { IDiceRoller } from "./interface";
import { renderDiceRoller } from "./view";

// In interacting with the service, we need to be explicit about whether we're creating a new document vs. loading
// an existing one.  We also need to provide the unique ID for the document we are loading from.

// In this app, we'll choose to create a new document when navigating directly to http://localhost:8080.
// We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:8080/#1596520748752.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
async function start(): Promise<void> {
    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    // The getTinyliciousContainer helper function facilitates loading our container code into a Container and
    // connecting to a locally-running test service called Tinylicious.  This will look different when moving to a
    // production service, but ultimately we'll still be getting a reference to a Container object.  The helper
    // function takes the ID of the document we're creating or loading, the container code to load into it, and a
    // flag to specify whether we're creating a new document or loading an existing one.
    const [container, containerId] = await getTinyliciousContainer(documentId, TaskSelectionFactory, shouldCreateNew);

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

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

    const div = document.getElementById("content") as HTMLDivElement;
    div.append(taskManagerDiv, divider, oldestClientDiv);
}

start().catch((error) => console.error(error));
