/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Signaler } from "@fluid-experimental/data-objects";
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
import { MouseTracker } from "./MouseTracker";

// Define the schema of our Container.
// This includes the DataObjects we support and any initial DataObjects we want created
// when the container is first created.
const containerSchema: ContainerSchema = {
    initialObjects: {
        /* [id]: DataObject */
        signaler: Signaler,
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
            ${getFocusPresencesString("</br>", focusTracker)}
        `;
    };

    onFocusChanged();
    focusTracker.on("focusChanged", onFocusChanged);

    wrapperDiv.appendChild(focusDiv);
}

function getFocusPresencesString(newLineSeparator: string = "\n", focusTracker: FocusTracker): string {
    const focusString: string[] = [];

    focusTracker.getFocusPresences().forEach((focus, userName) => {
        const prefix = `User ${userName}:`;
        if (focus === undefined) {
            focusString.push(`${prefix} unknown focus`);
        } else if (focus === true) {
            focusString.push(`${prefix} has focus`);
        } else {
            focusString.push(`${prefix} missing focus`);
        }
    });
    return focusString.join(newLineSeparator);
}

function renderMousePresence(mouseTracker: MouseTracker, focusTracker: FocusTracker, div: HTMLDivElement) {
    const onPositionChanged = () => {
      div.innerHTML = "";
      mouseTracker.getMousePresences().forEach((mousePosition, userName) => {
          const posDiv = document.createElement("div");
          posDiv.textContent = userName;
          posDiv.style.position = "absolute";
          posDiv.style.left = `${mousePosition.x}px`;
          posDiv.style.top = `${mousePosition.y}px`;
          if (focusTracker.getFocusPresences().get(userName) === true) {
            posDiv.style.fontWeight = "bold";
          }
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
    const focusTracker = new FocusTracker(
        container,
        services.audience,
        container.initialObjects.signaler as Signaler,
    );
    const mouseTracker = new MouseTracker(
        container,
        services.audience,
        container.initialObjects.signaler as Signaler,
    );
    renderFocusPresence(focusTracker, contentDiv);
    renderMousePresence(mouseTracker, focusTracker, mouseContentDiv);
}

start().catch(console.error);
