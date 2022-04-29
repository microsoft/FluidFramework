/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SignalManager } from "@fluid-experimental/data-objects";
import {
    IFluidContainer,
    ContainerSchema,
} from "fluid-framework";
import {
    TinyliciousClient,
    TinyliciousMember,
    TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";
import { FocusTracker } from "./FocusTracker";

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
const containerSchema: ContainerSchema = {
    initialObjects: {
        /* [id]: DataObject */
        signalManager: SignalManager,
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
    let container: IFluidContainer;
    let services: TinyliciousContainerServices;
    let containerId: string;

    // Get or create the document depending if we are running through the create new flow
    const createNew = !location.hash;
    if (createNew) {
        // The client will create a new container using the schema
        ({ container, services } = await client.createContainer(containerSchema));
        containerId = await container.attach();
        // The new container has its own unique ID that can be used to access it in another session
        location.hash = containerId;
    } else {
        containerId = location.hash.substring(1);
        // Use the unique container ID to fetch the container created earlier
        ({ container, services } = await client.getContainer(containerId, containerSchema));
    }
    // create/get container API returns a combination of the container and associated container services
    document.title = containerId;

    // Render page focus information for audience members
    const contentDiv = document.getElementById("content") as HTMLDivElement;
    const focusTracker = new FocusTracker(
        container,
        services.audience,
        container.initialObjects.signalManager as SignalManager,
    );
    renderFocusPresence(focusTracker, contentDiv);
}

start().catch(console.error);
