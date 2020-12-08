/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";

import { KeyValueContainerRuntimeFactory } from "./containerCode";
import { IKeyValueDataObject } from "./dataObject";
import { renderDiceRoller } from "./view";


let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

// View



// Model
const div = document.getElementById("content") as HTMLDivElement;


const getKeyValueDb = async function(): Promise<IKeyValueDataObject> {

    const container = await getTinyliciousContainer(documentId, KeyValueContainerRuntimeFactory, createNew);

    const url = "/";
    const response = await container.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    return response.value
};


getKeyValueDb().then((db) => {
    renderDiceRoller(db, div);
})




