/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { getTinyliciousContainer } from "../util";
import { IDiceRoller } from "../component";
import { PrettyDiceRollerView } from "./views";

// I'm choosing to put the docId in the hash just for my own convenience.  There should be no requirements on the
// page's URL format deeper in the system.
if (window.location.hash.length === 0) {
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);
document.title = documentId;

// In this app, we are assuming our container code is capable of providing a default mountable view.  This is up to
// how the container code is authored though (e.g. if the container code is data-only and does not bundle views).
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

    // Now we know we got the component back, time to start mounting it.
    return response.value;
}

async function renderPrettyDiceRoller(diceRoller: IDiceRoller) {
    const div = document.getElementById("content") as HTMLDivElement;
    ReactDOM.render(React.createElement(PrettyDiceRollerView, { model: diceRoller }), div);
}

// The format of the code proposal will be the contents of our package.json, which has a special "fluid" section
// describing the code to load.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");

// If you'd prefer to load the container bundle yourself (rather than relying on the codeLoader), pass the entrypoint
// to the module as the third param below (e.g. window["main"]).
getTinyliciousContainer(documentId, packageJson)
    .then(getDiceRollerFromContainer)
    .then(renderPrettyDiceRoller)
    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    .then(() => { window["fluidStarted"] = true; })
    .catch((error) => console.error(error));
