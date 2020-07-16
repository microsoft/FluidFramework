/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { Container } from "@fluidframework/container-loader";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IComponentMountableView } from "@fluidframework/view-interfaces";
import { getTinyliciousContainer } from "./tinyliciousContainer";

// I'm choosing to put the docId in the hash just for my own convenience.  There should be no requirements on the
// page's URL format deeper in the system.
if (window.location.hash.length === 0) {
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);
document.title = documentId;

async function mountDefaultComponentFromContainer(container: Container): Promise<void> {
    const div = document.getElementById("content") as HTMLDivElement;
    // For this basic scenario, I'm just requesting the default component.  Nothing stopping me from issuing alternate
    // requests (e.g. for other components) if I wished.
    const url = "/";
    const response = await container.request({
        // We request with a mountableView since we intend to get this view from across the bundle boundary.
        headers: {
            mountableView: true,
        },
        url,
    });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Unable to retrieve component at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    // Now we know we got the component back, time to start mounting it.
    const component = response.value as IComponent;

    // In a production app, we should probably be retaining a reference to mountableView long-term so we can call
    // unmount() on it to correctly remove it from the DOM if needed.
    const mountableView: IComponentMountableView | undefined = component.IComponentMountableView;
    if (mountableView !== undefined) {
        mountableView.mount(div);
        return;
    }

    // If we don't get a mountable view back, we can still try to use a view adapter.  This won't always work (e.g.
    // if the response is a React-based component using hooks) and is not the preferred path, but sometimes it
    // can work.
    console.warn(`Container returned a non-IComponentMountableView.  This can cause errors when mounting components `
        + `with React hooks across bundle boundaries.  URL: ${url}`);
    const view = new HTMLViewAdapter(component);
    view.render(div, { display: "block" });
}

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");

// If you'd prefer to load the bundle yourself (rather than relying on the codeLoader), pass the entrypoint to the
// module as the third param below (e.g. window["main"]).
getTinyliciousContainer(documentId, packageJson)
    .then(mountDefaultComponentFromContainer)
    .catch((error) => console.error(error));
