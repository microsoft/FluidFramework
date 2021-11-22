/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { FluidObject } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IFluidHTMLView, IFluidMountableView } from "@fluidframework/view-interfaces";
import { DiceRollerContainerRuntimeFactory } from "./containerCode";

// I'm choosing to put the docId in the hash just for my own convenience, so the URL will end up looking something
// like http://localhost:8080/#1596520748752.  This is not crucial to the scenario -- there should be no requirements
// on the page's URL format deeper in the system, so you're free to change this however you'd like.
// Additionally, I'm choosing to create a new document when navigating directly to http://localhost:8080 -- this is
// also open for customization.

// In this app, we are assuming our container code is capable of providing a default mountable view.  This is up to
// how the container code is authored though (e.g. if the container code is data-only and does not bundle views).
async function mountDefaultFluidObjectFromContainer(container: IContainer): Promise<void> {
    const div = document.getElementById("content") as HTMLDivElement;
    // For this basic scenario, I'm just requesting the default view.  Nothing stopping me from issuing alternate
    // requests (e.g. for other Fluid objects or views) if I wished.
    const url = "/";
    const response = await container.request({
        // We request with a mountableView since we intend to get this view from across the bundle boundary.
        headers: {
            mountableView: true,
        },
        url,
    });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve Fluid object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    // Now we know we got the Fluid Object back, time to start mounting it.
    const fluidObject: FluidObject<IFluidMountableView & IFluidHTMLView> = response.value;

    // In a production app, we should probably be retaining a reference to mountableView long-term so we can call
    // unmount() on it to correctly remove it from the DOM if needed.
    const mountableView: IFluidMountableView | undefined = fluidObject.IFluidMountableView;
    if (mountableView !== undefined) {
        mountableView.mount(div);
        return;
    }

    // If we don't get a mountable view back, we can still try to use a view adapter.  This won't always work (e.g.
    // if the response is a React-based component using hooks) and is not the preferred path, but sometimes it
    // can work.
    console.warn(`Container returned a non-IFluidMountableView.  This can cause errors when mounting React components `
        + `with hooks across bundle boundaries.  URL: ${url}`);
    const view = new HTMLViewAdapter(fluidObject);
    view.render(div, { display: "block" });
}

// Just a helper function to kick things off.  Making it async allows us to use await.
async function start(): Promise<void> {
    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    // Get the container to use.  Associate the data with the provided documentId, and run the provided code within.
    const [container, containerId] = await getTinyliciousContainer(
        documentId, DiceRollerContainerRuntimeFactory, shouldCreateNew,
    );

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

    await mountDefaultFluidObjectFromContainer(container);
    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

start().catch((error) => console.error(error));
