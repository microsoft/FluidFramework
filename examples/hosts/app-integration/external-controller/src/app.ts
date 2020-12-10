/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";

import { IKeyValueDataObject, KeyValueContainerRuntimeFactory } from "./kvpair-dataobject";
import { renderDiceRoller } from "./view";

let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

async function start(): Promise<void> {
    // Get Fluid Container (creates if new url)
    const container = await getTinyliciousContainer(documentId, KeyValueContainerRuntimeFactory, createNew);

    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our dice roller is available at the URL "/".
    const url = "/";
    const response = await container.request({ url });

    // Verify the response to make sure we got what we expected.
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    const keyValueDataObject: IKeyValueDataObject = response.value;

    renderDiceRoller(keyValueDataObject);
}

start().catch((error) => console.error(error));
