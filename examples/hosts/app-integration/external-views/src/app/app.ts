/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";
import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { IDiceRoller } from "../component";
import { PrettyDiceRollerView } from "./views";

// I'm choosing to put the docId in the hash just for my own convenience.  There should be no requirements on the
// page's URL format deeper in the system.
if (window.location.hash.length === 0) {
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);
document.title = documentId;

// In this app, we know our container code provides a default component that is an IDiceRoller.
async function getDiceRollerFromContainer(container: Container): Promise<IDiceRoller> {
    // For this basic scenario, I'm just requesting the default view.  Nothing stopping me from issuing alternate
    // requests (e.g. for other components or views) if I wished.
    const url = "/";
    const response = await container.request({ url });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Unable to retrieve component at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    return response.value;
}

// Given an IDiceRoller, we can render its data using the PrettyDiceRollerView we've created in our app.
async function renderPrettyDiceRoller(diceRoller: IDiceRoller) {
    const div = document.getElementById("content") as HTMLDivElement;
    ReactDOM.render(React.createElement(PrettyDiceRollerView, { model: diceRoller }), div);
}

// Just a helper function to kick things off.  Making it async allows us to use await.
async function start(): Promise<void> {
    // The format of the code proposal will be the contents of our package.json, which has a special "fluid" section
    // describing the code to load.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const packageJson = require("../../package.json");

    // If you'd prefer to load the container bundle yourself (rather than relying on the codeLoader), pass the
    // entrypoint to the module as the third param below (e.g. window["main"]).
    const container = await getTinyliciousContainer(documentId, packageJson);
    const diceRoller = await getDiceRollerFromContainer(container);
    await renderPrettyDiceRoller(diceRoller);
    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

start().catch((error) => console.error(error));
