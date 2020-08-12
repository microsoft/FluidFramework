/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import { IDiceRoller } from "./dataObject";
import { DiceRollerContainerRuntimeFactory } from "./containerCode";
import { renderDiceRoller } from "./view";

// I'm choosing to put the docId in the hash just for my own convenience, so the URL will end up looking something
// like http://localhost:8080/#1596520748752.  This is not crucial to the scenario -- there should be no requirements
// on the page's URL format deeper in the system, so you're free to change this however you'd like.
// Additionally, I'm choosing to create a new document when navigating directly to http://localhost:8080 -- this is
// also open for customization.
let createNew = false;
if (window.location.hash.length === 0) {
    createNew = true;
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);
document.title = documentId;

// Just a helper function to kick things off.  Making it async allows us to use await.
async function start(): Promise<void> {
    // Get the container to use.  Associate the data with the provided documentId, and run the provided code within.
    const container = await getTinyliciousContainer(documentId, DiceRollerContainerRuntimeFactory, createNew);

    // For this basic scenario, I'm just requesting the default view.  Nothing stopping me from issuing alternate
    // requests (e.g. for other data objects or views) if I wished.
    const url = "/";
    const response = await container.request({ url });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    // In this app, we know our container code provides a default data object that is an IDiceRoller.
    const diceRoller: IDiceRoller = response.value;

    // Given an IDiceRoller, we can render its data using the view we've created in our app.
    const div = document.getElementById("content") as HTMLDivElement;
    renderDiceRoller(diceRoller, div);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

start().catch((error) => console.error(error));
