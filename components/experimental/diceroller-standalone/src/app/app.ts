/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { start } from "./loader";

// I'm choosing to put the docId in the hash just for my own convenience
if (window.location.hash.length === 0) {
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);
document.title = documentId;

export const packageJson = require("../../package.json");

let fluidStarted = false;
start(
    documentId,
    packageJson,
    window["main"], // Entrypoint to the fluidExport
    parseInt(window.location.port), // port
    document.getElementById("content") as HTMLDivElement)
.then(() => fluidStarted = true)
.catch((error) => console.error(error));

// remove later
console.log(fluidStarted);
