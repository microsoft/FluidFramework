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
import { MouseFocusTracker } from "./FocusTracker";

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
const containerSchema: ContainerSchema = {
    initialObjects: {
        /* [id]: DataObject */
        signalManager: SignalManager,
    },
};

function renderFocusPresence(MouseFocusTracker: MouseFocusTracker, div: HTMLDivElement) {
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.textAlign = "left";
    wrapperDiv.style.margin = "70px";
    div.appendChild(wrapperDiv);

    const focusDiv = document.createElement("div");
    focusDiv.style.fontSize = "14px";

    const onFocusChanged = () => {
        focusDiv.innerHTML = `
            Current user: ${(MouseFocusTracker.audience.getMyself() as TinyliciousMember)?.userName}</br>
            ${MouseFocusTracker.getFocusPresencesString("</br>")}
        `;
    };

    onFocusChanged();
    MouseFocusTracker.on("focusChanged", onFocusChanged);

    wrapperDiv.appendChild(focusDiv);
}

function renderMousePresence(mouseTracker : MouseFocusTracker, div:HTMLDivElement){

    const onPositionChanged = () => {
      div.innerHTML = '';
      mouseTracker.getMousePresencesString().forEach(function(value, key){
          const posDiv = document.createElement("div");
          posDiv.textContent = key;
          posDiv.style.position = "absolute";
          posDiv.style.left = value[0]+'px';
          posDiv.style.top = value[1]+'px';
          div.appendChild(posDiv);
      });
    };

    onPositionChanged();
    mouseTracker.on("mousePositionChanged", onPositionChanged);
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
    const contentDiv = document.getElementById("focus-content") as HTMLDivElement;
    const mouseContentDiv = document.getElementById("mouse-position") as HTMLDivElement;
    const mouseFocusTracker = new MouseFocusTracker(
        container,
        services.audience,
        container.initialObjects.signalManager as SignalManager,
    );
    renderFocusPresence(mouseFocusTracker, contentDiv);
    renderMousePresence(mouseFocusTracker, mouseContentDiv);
}

start().catch(console.error);
