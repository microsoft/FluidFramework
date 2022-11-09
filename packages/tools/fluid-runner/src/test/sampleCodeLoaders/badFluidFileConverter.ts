/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

async function getFluidExport(): Promise<any> {
    return {
        // We don't validate the args or return values of functions. These errors will be noticed at runtime.
        getCodeLoader: () => "someValue",
        execute: "badExecute",
    };
}

export const fluidExport = getFluidExport();
