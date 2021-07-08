/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerSchema } from "@fluid-experimental/fluid-static";
import { TinyliciousClient, TinyliciousMember } from "@fluid-experimental/tinylicious-client";
import { FocusTracker } from "./FocusTracker";

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const containerId = location.hash.substring(1);
document.title = containerId;

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
export const containerSchema: ContainerSchema = {
    name: "focus-tracker-container",
    initialObjects: {
        /* [id]: DataObject */
        focusTracker: FocusTracker,
    },
};

function renderFocusPresence(focusTracker: FocusTracker, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "left";
    wrapperDiv.style.margin = "70px";
    div.appendChild(wrapperDiv);

    const focusDiv = document.createElement("div");
    focusDiv.style.fontSize = "14px";

    const onFocusChanged = () => {
        focusDiv.innerHTML = `
            Current user: ${(focusTracker.audience.getMyself() as TinyliciousMember)?.userName}</br>
            ${focusTracker.getPresencesString("</br>")}
        `;
    };

    onFocusChanged();
    focusTracker.on("focusChanged", onFocusChanged);

    wrapperDiv.appendChild(focusDiv);
}

async function start(): Promise<void> {
    // Get or create the document depending if we are running through the create new flow
    const client = new TinyliciousClient();
    const { fluidContainer, containerServices } = createNew
        ? await client.createContainer({ id: containerId }, containerSchema)
        : await client.getContainer({ id: containerId }, containerSchema);

    // Render page focus information for audience members
    const contentDiv = document.getElementById("content") as HTMLDivElement;
    const focusTracker = fluidContainer.initialObjects.focusTracker as FocusTracker;
    focusTracker.audience = containerServices.audience;
    renderFocusPresence(focusTracker, contentDiv);
}

start().catch((error) => console.error(error));
