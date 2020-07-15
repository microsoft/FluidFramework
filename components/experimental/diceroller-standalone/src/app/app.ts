/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import { Container } from "@fluidframework/container-loader";
import { RequestParser } from "@fluidframework/runtime-utils";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";
import { IComponentMountableView } from "@fluidframework/view-interfaces";
import { getTinyliciousContainer } from "./tinyliciousContainer";

// I'm choosing to put the docId in the hash just for my own convenience
if (window.location.hash.length === 0) {
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);
document.title = documentId;

async function getComponentAndRender(container: Container, url: string, div: HTMLDivElement) {
    const response = await container.request({
        headers: {
            mountableView: true,
        },
        url,
    });

    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        return false;
    }

    const component = response.value as IComponent;
    if (component === undefined) {
        return;
    }

    // We should be retaining a reference to mountableView long-term, so we can call unmount() on it to correctly
    // remove it from the DOM if needed.
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

async function doStuffWithContainer(container: Container) {
    const div = document.getElementById("content") as HTMLDivElement;

    // Needs updating if the doc id is in the hash
    const reqParser = new RequestParser({ url: window.location.href });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const componentUrl = `/${reqParser.createSubRequest(3)!.url}`;

    await getComponentAndRender(container, componentUrl, div);
    // Handle the code upgrade scenario (which fires contextChanged)
    container.on("contextChanged", () => {
        getComponentAndRender(container, componentUrl, div).catch(() => { });
    });
}

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const packageJson = require("../../package.json");

getTinyliciousContainer(
    documentId,
    packageJson,
    // eslint-disable-next-line dot-notation
    window["main"], // Entrypoint to the fluidExport
)
    .then(doStuffWithContainer)
    .catch((error) => console.error(error));
