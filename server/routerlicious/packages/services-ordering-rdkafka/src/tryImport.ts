/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Imports a module inside a try-catch block and swallows the error if import fails.
export function tryImportNodeRdkafka() {
    let module;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        module = require("node-rdkafka");
    } catch (e) {
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return module;
}
